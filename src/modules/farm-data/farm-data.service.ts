import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { FarmDataProducer } from './farm-data.producer';
import {
  FarmDataResult,
  FarmDataStatus,
  IrrigationSection,
  SensorSection,
  YieldSection,
} from './types/farm-data.types';

interface CachedFarmData {
  generated_at: string;
  sensors?: SensorSection;
  irrigation?: IrrigationSection;
  yield?: YieldSection;
}

/**
 * Manages the Redis-backed cache for farm dashboard data.
 *
 * Cache key `farm_data:{farmId}` holds the fully-rendered dashboard JSON (TTL
 * configurable per farmer). Key `farm_data_pending:{farmId}` (TTL 300 s) is a
 * deduplication lock that prevents multiple identical jobs from being enqueued
 * while one is already running.
 *
 * `getFarmData()` implements the read-through pattern:
 * 1. Return READY from cache if present.
 * 2. Return PENDING if the dedup lock is set.
 * 3. Otherwise set the lock, enqueue a job, and return PENDING.
 */
@Injectable()
export class FarmDataService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly producer: FarmDataProducer,
  ) {}

  onModuleInit() {
    this.redis = new Redis(this.configService.get<string>('REDIS_URL')!);
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  // ── Read-through cache ───────────────────────────────────────────────────

  /**
   * Returns cached dashboard data if available, or enqueues generation and
   * returns `{ status: PENDING }`. Deduplicates concurrent requests via a
   * 300-second Redis lock key.
   */
  async getFarmData(farmId: string): Promise<FarmDataResult> {
    const cached = await this.redis.get(`farm_data:${farmId}`);
    if (cached) {
      const data = JSON.parse(cached) as CachedFarmData;
      return { status: FarmDataStatus.READY, ...data };
    }

    const pending = await this.redis.get(`farm_data_pending:${farmId}`);
    if (pending) {
      return { status: FarmDataStatus.PENDING };
    }

    await this.redis.set(`farm_data_pending:${farmId}`, '1', 'EX', 300);
    await this.producer.enqueue(farmId);

    return { status: FarmDataStatus.PENDING };
  }

  // ── Worker helpers ───────────────────────────────────────────────────────

  /**
   * Persists the LLM-generated dashboard data to Redis and clears the pending lock.
   * Called by the consumer after a successful generation.
   */
  async cacheResult(
    farmId: string,
    data: CachedFarmData,
    ttlSeconds = 3600,
  ): Promise<void> {
    await this.redis.set(
      `farm_data:${farmId}`,
      JSON.stringify(data),
      'EX',
      ttlSeconds,
    );
    await this.redis.del(`farm_data_pending:${farmId}`);
  }

  /** Removes the pending dedup lock so the next query can trigger a fresh generation. */
  async clearPending(farmId: string): Promise<void> {
    await this.redis.del(`farm_data_pending:${farmId}`);
  }
}
