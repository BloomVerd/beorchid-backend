import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { FarmerModule } from '../farmer/farmer.module';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { YieldComparison } from '../health/entities/yield-comparison.entity';
import { FarmDataResolver } from './farm-data.resolver';
import { FarmDataService } from './farm-data.service';
import { FarmDataProducer } from './farm-data.producer';
import { FarmDataConsumer } from './farm-data.consumer';

/**
 * Provides the on-demand farm dashboard data pipeline. A GraphQL query triggers
 * Redis-cached result lookup; on a miss, a `generate-farm-data` job is enqueued
 * and the caller receives `status: PENDING`. The worker (FarmDataConsumer) fetches
 * telemetry, health, and yield data, calls the LLM, and caches the result.
 */
@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    BullModule.registerQueue({ name: 'farm-data-queue' }),
    TypeOrmModule.forFeature([Farm, FarmHealth, IotDevice, YieldComparison]),
  ],
  providers: [
    FarmDataResolver,
    FarmDataService,
    FarmDataProducer,
    FarmDataConsumer,
  ],
})
export class FarmDataModule {}
