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

  async cacheResult(farmId: string, data: CachedFarmData): Promise<void> {
    await this.redis.set(
      `farm_data:${farmId}`,
      JSON.stringify(data),
      'EX',
      3600,
    );
    await this.redis.del(`farm_data_pending:${farmId}`);
  }

  async clearPending(farmId: string): Promise<void> {
    await this.redis.del(`farm_data_pending:${farmId}`);
  }
}
