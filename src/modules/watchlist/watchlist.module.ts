import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watchlist } from './entities/watchlist.entity';
import { SavedSearch } from './entities/saved-search.entity';
import { WatchlistService } from './watchlist.service';
import { WatchlistResolver } from './watchlist.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([Watchlist, SavedSearch])],
  providers: [WatchlistService, WatchlistResolver],
  exports: [WatchlistService],
})
export class WatchlistModule {}
