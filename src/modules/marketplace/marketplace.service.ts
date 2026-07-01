import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  ILike,
  In,
  LessThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import * as crypto from 'crypto';
import { Listing, ListingStatus } from './entities/listing.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { Offer, OfferStatus } from './entities/offer.entity';
import { Deal, DealStatus } from './entities/deal.entity';
import { CreateListingInput } from './inputs/create-listing.input';
import { WalletService } from '../wallet/wallet.service';
import { LedgerAccount } from '../wallet/entities/ledger-entry.entity';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { NotificationType } from '../notifications/entities/notification.entity';

/**
 * Manages the full lifecycle of farm listing offers.
 *
 * Offer flow:
 *  1. Seller creates a Listing (status: OPEN).
 *  2. Buyer calls makeOffer → Listing moves to UNDER_OFFER.
 *  3. Seller may: acceptOffer (→ Deal IN_ESCROW), counterOffer, or rejectOffer.
 *     Buyer may (after a seller counter): acceptOffer, counterOffer, or rejectOffer.
 *     Neither party may act on an offer they themselves created (createdById).
 *  4. Buyer calls confirmDealPayment → escrow released to seller as USER_CASH.
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Deal) private readonly dealRepo: Repository<Deal>,
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepo: Repository<FarmHealth>,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly notificationsProducer: NotificationsProducer,
  ) {}

  // ── Listings ────────────────────────────────────────────────────────────────

  /**
   * Creates a new listing for a farm plot. Status is set to OPEN immediately
   * and the listing expires after 90 days.
   */
  async createListing(
    input: CreateListingInput,
    sellerId: string,
  ): Promise<Listing> {
    const listing = this.listingRepo.create({
      ...input,
      sellerId,
      status: ListingStatus.OPEN,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    });
    return this.listingRepo.save(listing);
  }

  /**
   * Returns all listings matching the given filters. When `minHealthScore` is
   * provided, a sub-query fetches the latest health record per farm and filters
   * out farms that don't meet the threshold.
   */
  async listListings(
    crop?: string,
    region?: string,
    status?: ListingStatus,
    maxPrice?: number,
    minHealthScore?: number,
  ): Promise<Listing[]> {
    const where: any = {};
    if (crop) where.crop = ILike(crop);
    if (region) where.region = region;
    if (status) where.status = status;
    if (maxPrice) where.askingPrice = LessThanOrEqual(maxPrice);
    if (minHealthScore != null) {
      const raw: { farmId: string }[] = await this.farmHealthRepo.query(
        `SELECT "farmId"
         FROM (
           SELECT DISTINCT ON ("farmId") "farmId", overall_score
           FROM farm_health
           ORDER BY "farmId", computed_at DESC NULLS LAST, "createdAt" DESC
         ) latest
         WHERE overall_score >= $1`,
        [minHealthScore],
      );
      const farmIds = raw.map((r) => r.farmId).filter(Boolean);
      if (farmIds.length === 0) return [];
      where.farmId = In(farmIds);
    }
    return this.listingRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Fetches a single listing by ID. Throws 404 if not found. */
  async findListingById(id: string): Promise<Listing> {
    const listing = await this.listingRepo.findOne({ where: { id } });
    if (!listing) throw new NotFoundException(`Listing ${id} not found`);
    return listing;
  }

  /** Returns all listings created by `sellerId`, optionally filtered by farm. */
  myListings(sellerId: string, farmId?: string): Promise<Listing[]> {
    const where: any = { sellerId };
    if (farmId) where.farmId = farmId;
    return this.listingRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Marks a listing as WITHDRAWN. Only the listing owner may do this. */
  async withdrawListing(id: string, sellerId: string): Promise<Listing> {
    const listing = await this.findListingById(id);
    if (listing.sellerId !== sellerId)
      throw new ForbiddenException('Not your listing');
    listing.status = ListingStatus.WITHDRAWN;
    return this.listingRepo.save(listing);
  }

  // ── Offers ─────────────────────────────────────────────────────────────────

  /**
   * Places an initial offer on a listing. Sets `createdById` to the buyer so
   * the buyer cannot subsequently counter or accept their own offer. Transitions
   * the listing to UNDER_OFFER on the first offer received, and fires an SSE
   * notification to the seller.
   *
   * @throws ForbiddenException  if the buyer is the listing's seller
   * @throws BadRequestException if the listing is not OPEN or UNDER_OFFER
   */
  async makeOffer(
    listingId: string,
    buyerId: string,
    amount: number,
    message?: string,
  ): Promise<Offer> {
    const listing = await this.findListingById(listingId);
    if (listing.sellerId === buyerId)
      throw new ForbiddenException('Cannot make offer on your own listing');
    if (
      listing.status !== ListingStatus.OPEN &&
      listing.status !== ListingStatus.UNDER_OFFER
    ) {
      throw new BadRequestException('Listing is not open for offers');
    }

    const offer = await this.offerRepo.save(
      this.offerRepo.create({
        listingId,
        buyerId,
        createdById: buyerId,
        amount,
        message: message ?? null,
        status: OfferStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    if (listing.status === ListingStatus.OPEN) {
      listing.status = ListingStatus.UNDER_OFFER;
      await this.listingRepo.save(listing);
    }

    this.notificationsProducer
      .notify(
        listing.sellerId,
        {
          title: 'New offer received',
          message: `You received an offer of ${amount / 100} GHS on your listing`,
          type: NotificationType.OFFER_RECEIVED,
        },
        true,
      )
      .catch((err) =>
        this.logger.error(
          `Failed to notify seller ${listing.sellerId} of new offer: ${err.message}`,
        ),
      );

    return offer;
  }

  /**
   * Creates a counter-offer in response to a pending offer. The original offer
   * is marked COUNTERED and a new PENDING offer is saved with `createdById`
   * set to the actor making the counter. Both seller and buyer may counter, but
   * neither may counter an offer they themselves created. Notifies the other
   * party via SSE.
   *
   * @throws NotFoundException   if the offer does not exist
   * @throws BadRequestException if the offer is not PENDING
   * @throws ForbiddenException  if the actor is unrelated to the offer, or is
   *                             countering their own offer
   */
  async counterOffer(
    offerId: string,
    actorId: string,
    amount: number,
    message?: string,
  ): Promise<Offer> {
    const original = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!original) throw new NotFoundException('Offer not found');
    if (original.status !== OfferStatus.PENDING)
      throw new BadRequestException('Offer is not pending');

    const listing = await this.findListingById(original.listingId);
    if (listing.sellerId !== actorId && original.buyerId !== actorId) {
      throw new ForbiddenException('Not authorised to counter this offer');
    }
    if (original.createdById === actorId) {
      throw new ForbiddenException('Cannot counter your own offer');
    }

    original.status = OfferStatus.COUNTERED;
    await this.offerRepo.save(original);

    const counter = await this.offerRepo.save(
      this.offerRepo.create({
        listingId: original.listingId,
        buyerId: original.buyerId,
        createdById: actorId,
        amount,
        message: message ?? null,
        parentOfferId: offerId,
        status: OfferStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    const recipientId =
      actorId === listing.sellerId ? original.buyerId : listing.sellerId;
    await this.notificationsProducer.notify(
      recipientId,
      {
        title: 'Counter offer received',
        message: `A counter offer of ${amount / 100} GHS was made on your offer`,
        type: NotificationType.OFFER_COUNTERED,
      },
      true,
    );

    return counter;
  }

  /**
   * Accepts a pending offer. Runs inside a serialisable transaction that:
   *  1. Marks the offer ACCEPTED and all other pending offers on the listing REJECTED.
   *  2. Moves the listing to ACCEPTED status.
   *  3. Debits the buyer's wallet to the ESCROW ledger account.
   *  4. Creates a Deal in IN_ESCROW status with a reference to the escrow transaction.
   *
   * Both the seller and buyer are notified via SSE. Only the party that did NOT
   * create the offer may accept it (`createdById` guard).
   *
   * If the escrow debit fails because the buyer's balance is insufficient and
   * the *seller* is the one accepting, the raw wallet error is not surfaced to
   * them (it would wrongly imply the seller is being charged, and would let
   * them probe the buyer's balance). Instead the buyer is notified
   * (`DEAL_PAYMENT_REQUIRED`) that the seller tried to accept but their wallet
   * needs topping up, and the seller receives a generic retry error. When the
   * *buyer* is the one accepting (e.g. accepting a seller's counter-offer),
   * the original `Insufficient balance` error is rethrown as-is.
   *
   * @throws NotFoundException   if the offer or listing does not exist
   * @throws BadRequestException if the offer is not PENDING, or if the escrow
   *                             debit fails (insufficient balance)
   * @throws ForbiddenException  if the actor is unrelated to the offer, or is
   *                             accepting their own offer
   */
  async acceptOffer(offerId: string, actorId: string): Promise<Deal> {
    return this.dataSource.transaction(async (em) => {
      const offerRepo = em.getRepository(Offer);
      const listingRepo = em.getRepository(Listing);
      const dealRepo = em.getRepository(Deal);

      const offer = await offerRepo.findOne({
        where: { id: offerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.status !== OfferStatus.PENDING)
        throw new BadRequestException('Offer is not pending');

      const listing = await listingRepo.findOne({
        where: { id: offer.listingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.sellerId !== actorId && offer.buyerId !== actorId) {
        throw new ForbiddenException('Not authorised to accept this offer');
      }
      if (offer.createdById === actorId) {
        throw new ForbiddenException('Cannot accept your own offer');
      }

      // Accept this offer
      offer.status = OfferStatus.ACCEPTED;
      await offerRepo.save(offer);

      // Auto-reject other open offers on this listing
      await offerRepo
        .createQueryBuilder()
        .update(Offer)
        .set({ status: OfferStatus.REJECTED })
        .where(
          'listingId = :listingId AND status = :status AND id != :offerId',
          {
            listingId: listing.id,
            status: OfferStatus.PENDING,
            offerId,
          },
        )
        .execute();

      // Mark listing accepted
      listing.status = ListingStatus.ACCEPTED;
      await listingRepo.save(listing);

      // Move buyer funds to escrow
      const buyerWallet = await this.walletService.getOrCreateWallet(
        offer.buyerId,
      );
      const txnId = crypto.randomUUID();
      try {
        await this.walletService.debit(
          buyerWallet.id,
          offer.amount,
          LedgerAccount.ESCROW,
          txnId,
          em,
        );
      } catch (err) {
        if (err instanceof BadRequestException && actorId !== offer.buyerId) {
          // The seller is accepting; don't leak the buyer's wallet balance
          // or make the seller think they're the one being charged.
          await this.notificationsProducer.notify(
            offer.buyerId,
            {
              title: 'Action needed: top up your wallet',
              message: `The seller tried to accept your offer of ${offer.amount / 100} GHS, but your wallet balance was insufficient. Add funds and re-offer to complete the deal.`,
              type: NotificationType.DEAL_PAYMENT_REQUIRED,
            },
            true,
          );
          throw new BadRequestException(
            'This offer cannot be accepted right now. Please try again later.',
          );
        }
        throw err;
      }

      // Create deal
      const deal = await dealRepo.save(
        dealRepo.create({
          listingId: listing.id,
          acceptedOfferId: offer.id,
          sellerId: listing.sellerId,
          buyerId: offer.buyerId,
          amount: offer.amount,
          status: DealStatus.IN_ESCROW,
          escrowLedgerRef: txnId,
        }),
      );

      await this.notificationsProducer.notify(
        offer.buyerId,
        {
          title: 'Offer accepted',
          message: `Your offer of ${offer.amount / 100} GHS was accepted`,
          type: NotificationType.OFFER_ACCEPTED,
        },
        true,
      );
      await this.notificationsProducer.notify(
        listing.sellerId,
        {
          title: 'Deal in escrow',
          message: `Funds of ${offer.amount / 100} GHS are now held in escrow`,
          type: NotificationType.DEAL_PAYMENT_REQUIRED,
        },
        true,
      );

      return deal;
    });
  }

  /**
   * Rejects a pending offer. Either the seller or the buyer may reject, but
   * neither may reject an offer they themselves created. The creator of the
   * rejected offer is notified via SSE.
   *
   * @throws NotFoundException  if the offer does not exist
   * @throws ForbiddenException if the actor is unrelated to the offer, or is
   *                            rejecting their own offer
   */
  async rejectOffer(offerId: string, actorId: string): Promise<Offer> {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    const listing = await this.findListingById(offer.listingId);

    const isSeller = listing.sellerId === actorId;
    const isBuyer = offer.buyerId === actorId;
    if (!isSeller && !isBuyer)
      throw new ForbiddenException('Not authorised to reject this offer');
    if (offer.createdById === actorId)
      throw new ForbiddenException('Cannot reject your own offer');

    offer.status = OfferStatus.REJECTED;

    await this.notificationsProducer.notify(
      offer.createdById ?? offer.buyerId,
      {
        title: 'Offer rejected',
        message: 'Your offer was rejected',
        type: NotificationType.OFFER_REJECTED,
      },
      true,
    );

    return this.offerRepo.save(offer);
  }

  /**
   * Withdraws the buyer's own pending offer. Only the buyer who created the
   * offer thread (`buyerId`) may withdraw, and only while the offer is PENDING.
   *
   * @throws NotFoundException   if the offer does not exist or belongs to another buyer
   * @throws BadRequestException if the offer is not PENDING
   */
  async withdrawOffer(offerId: string, buyerId: string): Promise<Offer> {
    const offer = await this.offerRepo.findOne({
      where: { id: offerId, buyerId },
    });
    if (!offer) throw new NotFoundException('Offer not found or not yours');
    if (offer.status !== OfferStatus.PENDING)
      throw new BadRequestException('Can only withdraw pending offers');
    offer.status = OfferStatus.WITHDRAWN;
    return this.offerRepo.save(offer);
  }

  /** Returns all offers on a listing ordered by creation date descending. */
  listingOffers(listingId: string): Promise<Offer[]> {
    return this.offerRepo.find({
      where: { listingId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Returns all offers created by the given buyer. */
  myOffers(buyerId: string): Promise<Offer[]> {
    return this.offerRepo.find({
      where: { buyerId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Returns all deals where the user is either the buyer or the seller. */
  myDeals(userId: string): Promise<Deal[]> {
    return this.dealRepo.find({
      where: [{ buyerId: userId }, { sellerId: userId }],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Confirms that the seller has fulfilled the deal. Runs inside a transaction
   * that marks the deal COMPLETED and credits the seller's wallet from the
   * ESCROW account to USER_CASH. The seller is notified via SSE.
   *
   * Only the buyer of the deal may call this method.
   *
   * @throws NotFoundException   if the deal does not exist or does not belong to the buyer
   * @throws BadRequestException if the deal is already COMPLETED
   */
  async confirmDealPayment(dealId: string, buyerId: string): Promise<Deal> {
    const saved = await this.dataSource.transaction(async (em) => {
      const dealRepo = em.getRepository(Deal);

      const deal = await dealRepo.findOne({
        where: { id: dealId, buyerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!deal) throw new NotFoundException('Deal not found');
      if (deal.status === DealStatus.COMPLETED)
        throw new BadRequestException('Deal already completed');

      deal.status = DealStatus.COMPLETED;
      const result = await dealRepo.save(deal);

      // Release escrow to seller
      const sellerWallet = await this.walletService.getOrCreateWallet(
        deal.sellerId,
      );
      const txnId = crypto.randomUUID();
      await this.walletService.credit(
        sellerWallet.id,
        deal.amount,
        LedgerAccount.USER_CASH,
        txnId,
        em,
      );

      return result;
    });

    await this.notificationsProducer.notify(
      saved.sellerId,
      {
        title: 'Deal completed',
        message: `Payment of ${saved.amount / 100} GHS has been released to your wallet`,
        type: NotificationType.DEAL_COMPLETED,
      },
      true,
    );

    return saved;
  }
}
