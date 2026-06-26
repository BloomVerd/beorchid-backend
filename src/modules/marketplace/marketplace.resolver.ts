import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { Listing, ListingStatus } from './entities/listing.entity';
import { Offer } from './entities/offer.entity';
import { Deal } from './entities/deal.entity';
import { CreateListingInput } from './inputs/create-listing.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class MarketplaceResolver {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ── Listings ──────────────────────────────────────────────────────────────

  @Query(() => [Listing])
  listings(
    @Args('crop', { nullable: true }) crop?: string,
    @Args('region', { nullable: true }) region?: string,
    @Args('status', { nullable: true, type: () => ListingStatus }) status?: ListingStatus,
  ): Promise<Listing[]> {
    return this.marketplaceService.listListings(crop, region, status);
  }

  @Query(() => Listing)
  listing(@Args('id', { type: () => ID }) id: string): Promise<Listing> {
    return this.marketplaceService.findListingById(id);
  }

  @Mutation(() => Listing)
  @UseGuards(RolesGuard)
  @Roles('farmer', 'super_admin')
  createListing(
    @Args('input') input: CreateListingInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<Listing> {
    return this.marketplaceService.createListing(input, user.id);
  }

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

  @Query(() => [Offer])
  listingOffers(@Args('listingId', { type: () => ID }) listingId: string): Promise<Offer[]> {
    return this.marketplaceService.listingOffers(listingId);
  }

  @Query(() => [Offer])
  myOffers(@CurrentFarmer() user: Farmer): Promise<Offer[]> {
    return this.marketplaceService.myOffers(user.id);
  }

  @Mutation(() => Offer)
  @UseGuards(RolesGuard)
  @Roles('individual', 'company', 'super_admin')
  makeOffer(
    @Args('listingId', { type: () => ID }) listingId: string,
    @Args('amount', { type: () => Number }) amount: number,
    @Args('message', { nullable: true, type: () => String }) message: string | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.makeOffer(listingId, user.id, amount, message);
  }

  @Mutation(() => Offer)
  counterOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @Args('amount', { type: () => Number }) amount: number,
    @Args('message', { nullable: true, type: () => String }) message: string | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.counterOffer(offerId, user.id, amount, message);
  }

  @Mutation(() => Deal)
  acceptOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Deal> {
    return this.marketplaceService.acceptOffer(offerId, user.id);
  }

  @Mutation(() => Offer)
  @UseGuards(RolesGuard)
  @Roles('farmer', 'super_admin')
  rejectOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.rejectOffer(offerId, user.id);
  }

  @Mutation(() => Offer)
  withdrawOffer(
    @Args('offerId', { type: () => ID }) offerId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Offer> {
    return this.marketplaceService.withdrawOffer(offerId, user.id);
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  @Query(() => [Deal])
  myDeals(@CurrentFarmer() user: Farmer): Promise<Deal[]> {
    return this.marketplaceService.myDeals(user.id);
  }

  @Mutation(() => Deal)
  confirmDealPayment(
    @Args('dealId', { type: () => ID }) dealId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<Deal> {
    return this.marketplaceService.confirmDealPayment(dealId, user.id);
  }
}
