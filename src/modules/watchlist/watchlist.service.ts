import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Watchlist, WatchlistEntityType } from './entities/watchlist.entity';
import { SavedSearch } from './entities/saved-search.entity';

/**
 * Service for managing user watchlists and saved search presets.
 *
 * Watchlist entries are idempotent on `(userId, entityType, entityId)` —
 * calling `addToWatchlist` for an already-watched item returns the existing
 * record rather than creating a duplicate.
 *
 * Saved searches store an arbitrary `filters` JSON object under a user-defined
 * name, allowing the client to restore complex filter states without
 * re-building them from scratch.
 */
@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(Watchlist) private readonly watchlistRepo: Repository<Watchlist>,
    @InjectRepository(SavedSearch) private readonly searchRepo: Repository<SavedSearch>,
  ) {}

  /** Returns all watchlist entries for the user, newest first. */
  myWatchlist(userId: string): Promise<Watchlist[]> {
    return this.watchlistRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Adds an entity to the user's watchlist. Idempotent — returns the existing
   * entry if the `(userId, entityType, entityId)` combination already exists.
   * Optionally stores a `priceThreshold` for future price-alert use.
   */
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

  /**
   * Removes a watchlist entry by ID. Only the owning user's entries are
   * considered (the query filters on `userId`).
   *
   * @throws NotFoundException if the entry does not exist or belongs to another user
   */
  async removeFromWatchlist(userId: string, id: string): Promise<boolean> {
    const item = await this.watchlistRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Watchlist item not found');
    await this.watchlistRepo.remove(item);
    return true;
  }

  /** Returns all saved searches for the user, newest first. */
  mySavedSearches(userId: string): Promise<SavedSearch[]> {
    return this.searchRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** Creates a named saved search with an arbitrary `filters` JSON payload. */
  createSavedSearch(userId: string, name: string, filters: Record<string, unknown>): Promise<SavedSearch> {
    return this.searchRepo.save(this.searchRepo.create({ userId, name, filters }));
  }

  /**
   * Deletes a saved search by ID. Only the owning user's records are considered.
   *
   * @throws NotFoundException if the saved search does not exist or belongs to another user
   */
  async deleteSavedSearch(userId: string, id: string): Promise<boolean> {
    const item = await this.searchRepo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException('Saved search not found');
    await this.searchRepo.remove(item);
    return true;
  }
}
