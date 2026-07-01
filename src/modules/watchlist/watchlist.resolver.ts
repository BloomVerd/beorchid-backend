import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { Watchlist, WatchlistEntityType } from './entities/watchlist.entity';
import { SavedSearch } from './entities/saved-search.entity';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for watchlist and saved-search operations. All queries and
 * mutations require a valid JWT and are scoped to the authenticated user —
 * no cross-user access is possible.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class WatchlistResolver {
  constructor(private readonly watchlistService: WatchlistService) {}

  /** Returns all watchlist entries for the authenticated user, newest first. */
  @Query(() => [Watchlist])
  myWatchlist(@CurrentFarmer() user: Farmer): Promise<Watchlist[]> {
    return this.watchlistService.myWatchlist(user.id);
  }

  /** Returns all saved searches for the authenticated user, newest first. */
  @Query(() => [SavedSearch])
  mySavedSearches(@CurrentFarmer() user: Farmer): Promise<SavedSearch[]> {
    return this.watchlistService.mySavedSearches(user.id);
  }

  /**
   * Adds an entity to the authenticated user's watchlist. Idempotent —
   * returns the existing entry if already watched. Optionally stores a
   * `priceThreshold` for future price-alert triggering.
   */
  @Mutation(() => Watchlist)
  addToWatchlist(
    @Args('entityType', { type: () => WatchlistEntityType }) entityType: WatchlistEntityType,
    @Args('entityId', { type: () => ID }) entityId: string,
    @Args('priceThreshold', { type: () => Int, nullable: true }) priceThreshold: number | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<Watchlist> {
    return this.watchlistService.addToWatchlist(user.id, entityType, entityId, priceThreshold);
  }

  /** Removes a watchlist entry by ID. Only the owning user can remove their own entries. */
  @Mutation(() => Boolean)
  removeFromWatchlist(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<boolean> {
    return this.watchlistService.removeFromWatchlist(user.id, id);
  }

  /** Creates a named saved search with an arbitrary filters JSON object. */
  @Mutation(() => SavedSearch)
  createSavedSearch(
    @Args('name') name: string,
    @Args('filters', { type: () => Object }) filters: Record<string, unknown>,
    @CurrentFarmer() user: Farmer,
  ): Promise<SavedSearch> {
    return this.watchlistService.createSavedSearch(user.id, name, filters);
  }

  /** Deletes a saved search by ID. Only the owning user can delete their own saved searches. */
  @Mutation(() => Boolean)
  deleteSavedSearch(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<boolean> {
    return this.watchlistService.deleteSavedSearch(user.id, id);
  }
}
