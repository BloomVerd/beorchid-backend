import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Float } from '@nestjs/graphql';
import { MarketplaceService } from './marketplace.service';
import { Listing, ListingStatus } from './entities/listing.entity';
import { Offer } from './entities/offer.entity';
import { Deal } from './entities/deal.entity';
import { CreateListingInput } from './inputs/create-listing.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';
import { Farm } from '../farm/entities/farm.entity';
import { ImageData } from '../farm/entities/image-data.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';

/**
 * GraphQL resolver for the marketplace module. All operations require a valid
 * JWT (`GqlJwtAuthGuard`). Role-specific mutations additionally require the
 * `RolesGuard`. Computed fields (`lat`, `lon`, `farmImages`, `farmHealth`) are
 * resolved lazily per listing to avoid N+1 issues on list queries.
 */
@Resolver(() => Listing)
@UseGuards(GqlJwtAuthGuard)
export class MarketplaceResolver {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    @InjectRepository(Farm) private readonly farmRepo: Repository<Farm>,
    @InjectRepository(ImageData)
    private readonly imageDataRepo: Repository<ImageData>,
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepo: Repository<FarmHealth>,
  ) {}

  // ── Listings ──────────────────────────────────────────────────────────────

  /** Returns all listings. Supports optional filters for crop, region, status, max price, and minimum farm health score. */
  @Query(() => [Listing])
  listings(
    @Args('crop', { nullable: true }) crop?: string,
    @Args('region', { nullable: true }) region?: string,
    @Args('status', { nullable: true, type: () => ListingStatus })
    status?: ListingStatus,
    @Args('maxPrice', { nullable: true, type: () => Float }) maxPrice?: number,
    @Args('minHealthScore', { nullable: true, type: () => Float })
    minHealthScore?: number,
  ): Promise<Listing[]> {
    return this.marketplaceService.listListings(
      crop,
      region,
      status,
      maxPrice,
      minHealthScore,
    );
  }

  /** Returns a single listing by ID. */
  @Query(() => Listing)
  listing(@Args('id', { type: () => ID }) id: string): Promise<Listing> {
    return this.marketplaceService.findListingById(id);
  }

  /** Returns listings owned by the authenticated user, optionally filtered by farm. */
  @Query(() => [Listing])
  myListings(
    @Args('farmId', { nullable: true, type: () => ID })
    farmId: string | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<Listing[]> {
    return this.marketplaceService.myListings(user.id, farmId);
  }

  /** Resolves the farm's latitude coordinate for a listing. */
  @ResolveField('lat', () => Float, { nullable: true })
  async resolvedLat(@Parent() listing: Listing): Promise<number | null> {
    const farm = await this.farmRepo.findOne({
      where: { id: listing.farmId },
      select: ['id', 'lat'],
    });
    return farm?.lat ?? null;
  }

  /** Resolves the farm's longitude coordinate for a listing. */
  @ResolveField('lon', () => Float, { nullable: true })
  async resolvedLon(@Parent() listing: Listing): Promise<number | null> {
    const farm = await this.farmRepo.findOne({
      where: { id: listing.farmId },
      select: ['id', 'lon'],
    });
    return farm?.lon ?? null;
  }

  /** Resolves the five most recent farm images for a listing. */
  @ResolveField('farmImages', () => [ImageData])
  async resolvedFarmImages(@Parent() listing: Listing): Promise<ImageData[]> {
    return this.imageDataRepo.find({
      where: { farm: { id: listing.farmId } },
      order: { createdAt: 'DESC' },
      take: 5,
    });
  }

  /** Resolves the most recent farm health record for a listing. */
  @ResolveField('farmHealth', () => FarmHealth, { nullable: true })
  async resolvedFarmHealth(
    @Parent() listing: Listing,
  ): Promise<FarmHealth | null> {
    return this.farmHealthRepo.findOne({
      where: { farm: { id: listing.farmId } },
      order: { computed_at: 'DESC' },
    });
  }

  /** Creates a new listing. Restricted to farmers and admins. */
  @Mutation(() => Listing)
  @UseGuards(RolesGuard)
  @Roles('farmer', 'super_admin')
  createListing(
    @Args('input') input: CreateListingInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<Listing> {
    return this.marketplaceService.createListing(input, user.id);
  }

  /** Withdraws an existing listing. Only the listing owner may do this. */
  @Mutation(() => Listing)
  @UseGuards(RolesGuard)
  @Roles('farmer', 'super_admin')
  withdrawListing(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Listing> {
    return this.marketplaceService.withdrawListing(id, user.id);
  }

  // ── Offers ────────────────────────────────────────────────────────────────

  /** Returns all offers on a listing, including the full counter-offer chain. */
  @Query(() => [Offer])
  listingOffers(
    @Args('listingId', { type: () => ID }) listingId: string,
  ): Promise<Offer[]> {
    return this.marketplaceService.listingOffers(listingId);
  }

  /** Returns all offers made by the authenticated user. */
  @Query(() => [Offer])
  myOffers(@CurrentFarmer() user: Farmer): Promise<Offer[]> {
    return this.marketplaceService.myOffers(user.id);
  }

  /**
   * Places an initial offer on a listing. Restricted to investors (individual /
   * company) and admins. The caller must not be the listing's seller.
   */
  @Mutation(() => Offer)
  @UseGuards(RolesGuard)
  @Roles('individual', 'company', 'super_admin')
  makeOffer(
    @Args('listingId', { type: () => ID }) listingId: string,
    @Args('amount', { type: () => Number }) amount: number,
    @Args('message', { nullable: true, type: () => String })
    message: string | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.makeOffer(
      listingId,
      user.id,
      amount,
      message,
    );
  }

  /**
   * Counters a pending offer with a new amount. Both the seller and buyer may
   * counter, but neither may counter an offer they themselves created.
   */
  @Mutation(() => Offer)
  @UseGuards(RolesGuard)
  @Roles('farmer', 'individual', 'company', 'super_admin')
  counterOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @Args('amount', { type: () => Number }) amount: number,
    @Args('message', { nullable: true, type: () => String })
    message: string | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.counterOffer(
      offerId,
      user.id,
      amount,
      message,
    );
  }

  /**
   * Accepts a pending offer, debits the buyer's wallet to escrow, and creates
   * a Deal. Both the seller and buyer may accept, but neither may accept an
   * offer they themselves created.
   */
  @Mutation(() => Deal)
  @UseGuards(RolesGuard)
  @Roles('farmer', 'individual', 'company', 'super_admin')
  acceptOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Deal> {
    return this.marketplaceService.acceptOffer(offerId, user.id);
  }

  /**
   * Rejects a pending offer. Both the seller and buyer may reject, but neither
   * may reject an offer they themselves created.
   */
  @Mutation(() => Offer)
  @UseGuards(RolesGuard)
  @Roles('farmer', 'individual', 'company', 'super_admin')
  rejectOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.rejectOffer(offerId, user.id);
  }

  /** Withdraws the authenticated user's own pending offer. */
  @Mutation(() => Offer)
  withdrawOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.withdrawOffer(offerId, user.id);
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /** Returns all deals where the authenticated user is either buyer or seller. */
  @Query(() => [Deal])
  myDeals(@CurrentFarmer() user: Farmer): Promise<Deal[]> {
    return this.marketplaceService.myDeals(user.id);
  }

  /**
   * Confirms delivery of a deal, releasing escrowed funds to the seller's
   * wallet. Only the buyer of the deal may call this.
   */
  @Mutation(() => Deal)
  confirmDealPayment(
    @Args('dealId', { type: () => ID }) dealId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Deal> {
    return this.marketplaceService.confirmDealPayment(dealId, user.id);
  }
}
