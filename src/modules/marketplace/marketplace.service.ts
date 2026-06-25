import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Listing, ListingStatus } from './entities/listing.entity';
import { Offer, OfferStatus } from './entities/offer.entity';
import { Deal, DealStatus } from './entities/deal.entity';
import { CreateListingInput } from './inputs/create-listing.input';
import { WalletService } from '../wallet/wallet.service';
import { LedgerAccount } from '../wallet/entities/ledger-entry.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(Listing) private readonly listingRepo: Repository<Listing>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Deal) private readonly dealRepo: Repository<Deal>,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Listings ────────────────────────────────────────────────────────────────

  async createListing(input: CreateListingInput, sellerId: string): Promise<Listing> {
    const listing = this.listingRepo.create({
      ...input,
      sellerId,
      status: ListingStatus.OPEN,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    });
    return this.listingRepo.save(listing);
  }

  listListings(crop?: string, region?: string, status?: ListingStatus): Promise<Listing[]> {
    const where: any = {};
    if (crop) where.crop = crop;
    if (region) where.region = region;
    if (status) where.status = status;
    return this.listingRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findListingById(id: string): Promise<Listing> {
    const listing = await this.listingRepo.findOne({ where: { id } });
    if (!listing) throw new NotFoundException(`Listing ${id} not found`);
    return listing;
  }

  async withdrawListing(id: string, sellerId: string): Promise<Listing> {
    const listing = await this.findListingById(id);
    if (listing.sellerId !== sellerId) throw new ForbiddenException('Not your listing');
    listing.status = ListingStatus.WITHDRAWN;
    return this.listingRepo.save(listing);
  }

  // ── Offers ─────────────────────────────────────────────────────────────────

  async makeOffer(listingId: string, buyerId: string, amount: number, message?: string): Promise<Offer> {
    const listing = await this.findListingById(listingId);
    if (listing.status !== ListingStatus.OPEN && listing.status !== ListingStatus.UNDER_OFFER) {
      throw new BadRequestException('Listing is not open for offers');
    }

    const offer = await this.offerRepo.save(
      this.offerRepo.create({
        listingId,
        buyerId,
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

    await this.notificationsService.create(listing.sellerId, {
      title: 'New offer received',
      message: `You received an offer of ${amount / 100} GHS on your listing`,
      type: NotificationType.OFFER_RECEIVED,
    });

    return offer;
  }

  async counterOffer(offerId: string, actorId: string, amount: number, message?: string): Promise<Offer> {
    const original = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!original) throw new NotFoundException('Offer not found');

    original.status = OfferStatus.COUNTERED;
    await this.offerRepo.save(original);

    const counter = await this.offerRepo.save(
      this.offerRepo.create({
        listingId: original.listingId,
        buyerId: actorId,
        amount,
        message: message ?? null,
        parentOfferId: offerId,
        status: OfferStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    await this.notificationsService.create(original.buyerId, {
      title: 'Counter offer received',
      message: `A counter offer of ${amount / 100} GHS was made on your offer`,
      type: NotificationType.OFFER_COUNTERED,
    });

    return counter;
  }

  async acceptOffer(offerId: string, actorId: string): Promise<Deal> {
    return this.dataSource.transaction(async (em) => {
      const offerRepo = em.getRepository(Offer);
      const listingRepo = em.getRepository(Listing);
      const dealRepo = em.getRepository(Deal);

      const offer = await offerRepo.findOne({ where: { id: offerId }, lock: { mode: 'pessimistic_write' } });
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.status !== OfferStatus.PENDING) throw new BadRequestException('Offer is not pending');

      const listing = await listingRepo.findOne({ where: { id: offer.listingId }, lock: { mode: 'pessimistic_write' } });
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.sellerId !== actorId && offer.buyerId !== actorId) {
        throw new ForbiddenException('Not authorised to accept this offer');
      }

      // Accept this offer
      offer.status = OfferStatus.ACCEPTED;
      await offerRepo.save(offer);

      // Auto-reject other open offers on this listing
      await offerRepo
        .createQueryBuilder()
        .update(Offer)
        .set({ status: OfferStatus.REJECTED })
        .where('listingId = :listingId AND status = :status AND id != :offerId', {
          listingId: listing.id,
          status: OfferStatus.PENDING,
          offerId,
        })
        .execute();

      // Mark listing accepted
      listing.status = ListingStatus.ACCEPTED;
      await listingRepo.save(listing);

      // Move buyer funds to escrow
      const buyerWallet = await this.walletService.getOrCreateWallet(offer.buyerId);
      const txnId = crypto.randomUUID();
      await this.walletService.debit(buyerWallet.id, offer.amount, LedgerAccount.ESCROW, txnId, em);

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

      await this.notificationsService.create(offer.buyerId, {
        title: 'Offer accepted',
        message: `Your offer of ${offer.amount / 100} GHS was accepted`,
        type: NotificationType.OFFER_ACCEPTED,
      });
      await this.notificationsService.create(listing.sellerId, {
        title: 'Deal in escrow',
        message: `Funds of ${offer.amount / 100} GHS are now held in escrow`,
        type: NotificationType.DEAL_PAYMENT_REQUIRED,
      });

      return deal;
    });
  }

  async rejectOffer(offerId: string, sellerId: string): Promise<Offer> {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    const listing = await this.findListingById(offer.listingId);
    if (listing.sellerId !== sellerId) throw new ForbiddenException('Not your listing');
    offer.status = OfferStatus.REJECTED;

    await this.notificationsService.create(offer.buyerId, {
      title: 'Offer rejected',
      message: 'Your offer was rejected',
      type: NotificationType.OFFER_REJECTED,
    });

    return this.offerRepo.save(offer);
  }

  async withdrawOffer(offerId: string, buyerId: string): Promise<Offer> {
    const offer = await this.offerRepo.findOne({ where: { id: offerId, buyerId } });
    if (!offer) throw new NotFoundException('Offer not found or not yours');
    if (offer.status !== OfferStatus.PENDING) throw new BadRequestException('Can only withdraw pending offers');
    offer.status = OfferStatus.WITHDRAWN;
    return this.offerRepo.save(offer);
  }

  listingOffers(listingId: string): Promise<Offer[]> {
    return this.offerRepo.find({ where: { listingId }, order: { createdAt: 'DESC' } });
  }

  myOffers(buyerId: string): Promise<Offer[]> {
    return this.offerRepo.find({ where: { buyerId }, order: { createdAt: 'DESC' } });
  }

  myDeals(userId: string): Promise<Deal[]> {
    return this.dealRepo.find({ where: [{ buyerId: userId }, { sellerId: userId }], order: { createdAt: 'DESC' } });
  }

  async confirmDealPayment(dealId: string, buyerId: string): Promise<Deal> {
    const deal = await this.dealRepo.findOne({ where: { id: dealId, buyerId } });
    if (!deal) throw new NotFoundException('Deal not found');

    deal.status = DealStatus.COMPLETED;
    const saved = await this.dealRepo.save(deal);

    // Release escrow to seller
    const sellerWallet = await this.walletService.getOrCreateWallet(deal.sellerId);
    const txnId = crypto.randomUUID();
    await this.walletService.credit(sellerWallet.id, deal.amount, LedgerAccount.USER_CASH, txnId);

    await this.notificationsService.create(deal.sellerId, {
      title: 'Deal completed',
      message: `Payment of ${deal.amount / 100} GHS has been released to your wallet`,
      type: NotificationType.DEAL_COMPLETED,
    });

    return saved;
  }
}
