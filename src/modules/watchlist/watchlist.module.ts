import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watchlist } from './entities/watchlist.entity';
import { SavedSearch } from './entities/saved-search.entity';
import { WatchlistService } from './watchlist.service';
import { WatchlistResolver } from './watchlist.resolver';

/**
 * Watchlist module — user watchlists and saved search presets.
 *
 * A `Watchlist` entry pins a user to any watchable entity (listing, coin, or
 * investment plan) with an optional price-alert threshold. A `SavedSearch`
 * stores a named set of filter criteria that the user can quickly replay.
 *
 * Exports WatchlistService for potential use by notification or alert services.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Watchlist, SavedSearch])],
  providers: [WatchlistService, WatchlistResolver],
  exports: [WatchlistService],
})
export class WatchlistModule {}
