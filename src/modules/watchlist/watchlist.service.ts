import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watchlist, WatchlistEntityType } from './entities/watchlist.entity';
import { SavedSearch } from './entities/saved-search.entity';

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(Watchlist) private readonly watchlistRepo: Repository<Watchlist>,
    @InjectRepository(SavedSearch) private readonly searchRepo: Repository<SavedSearch>,
  ) {}

  myWatchlist(userId: string): Promise<Watchlist[]> {
    return this.watchlistRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async addToWatchlist(
    userId: string,
    entityType: WatchlistEntityType,
    entityId: string,
    priceThreshold?: number,
  ): Promise<Watchlist> {
    const existing = await this.watchlistRepo.findOne({ where: { userId, entityType, entityId } });
    if (existing) return existing;
    return this.watchlistRepo.save(
      this.watchlistRepo.create({ userId, entityType, entityId, priceThreshold: priceThreshold ?? null }),
    );
  }

  async removeFromWatchlist(userId: string, id: string): Promise<boolean> {
    const item = await this.watchlistRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Watchlist item not found');
    await this.watchlistRepo.remove(item);
    return true;
  }

  mySavedSearches(userId: string): Promise<SavedSearch[]> {
    return this.searchRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  createSavedSearch(userId: string, name: string, filters: Record<string, unknown>): Promise<SavedSearch> {
    return this.searchRepo.save(this.searchRepo.create({ userId, name, filters }));
  }

  async deleteSavedSearch(userId: string, id: string): Promise<boolean> {
    const item = await this.searchRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Saved search not found');
    await this.searchRepo.remove(item);
    return true;
  }
}
