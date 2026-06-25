import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { Watchlist, WatchlistEntityType } from './entities/watchlist.entity';
import { SavedSearch } from './entities/saved-search.entity';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class WatchlistResolver {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Query(() => [Watchlist])
  myWatchlist(@CurrentFarmer() user: Farmer): Promise<Watchlist[]> {
    return this.watchlistService.myWatchlist(user.id);
  }

  @Query(() => [SavedSearch])
  mySavedSearches(@CurrentFarmer() user: Farmer): Promise<SavedSearch[]> {
    return this.watchlistService.mySavedSearches(user.id);
  }

  @Mutation(() => Watchlist)
  addToWatchlist(
    @Args('entityType', { type: () => WatchlistEntityType }) entityType: WatchlistEntityType,
    @Args('entityId', { type: () => ID }) entityId: string,
    @Args('priceThreshold', { type: () => Int, nullable: true }) priceThreshold: number | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<Watchlist> {
    return this.watchlistService.addToWatchlist(user.id, entityType, entityId, priceThreshold);
  }

  @Mutation(() => Boolean)
  removeFromWatchlist(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<boolean> {
    return this.watchlistService.removeFromWatchlist(user.id, id);
  }

  @Mutation(() => SavedSearch)
  createSavedSearch(
    @Args('name') name: string,
    @Args('filters', { type: () => Object }) filters: Record<string, unknown>,
    @CurrentFarmer() user: Farmer,
  ): Promise<SavedSearch> {
    return this.watchlistService.createSavedSearch(user.id, name, filters);
  }

  @Mutation(() => Boolean)
  deleteSavedSearch(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<boolean> {
    return this.watchlistService.deleteSavedSearch(user.id, id);
  }
}
