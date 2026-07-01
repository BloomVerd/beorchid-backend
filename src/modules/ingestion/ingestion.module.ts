import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MulterModule } from '@nestjs/platform-express';
import { DataIngestionJob } from './entities/data-ingestion-job.entity';
import { ExternalFeed } from './entities/external-feed.entity';
import { IngestionService } from './ingestion.service';
import { IngestionResolver } from './ingestion.resolver';
import { IngestionController } from './ingestion.controller';
import { IngestionConsumer } from './ingestion.consumer';
import { MarketModule } from '../market/market.module';

/**
 * Ingestion module — admin tooling for bulk-importing market price data.
 *
 * Supports three intake paths:
 *  1. REST CSV/JSON file upload (multipart, via IngestionController)
 *  2. GraphQL single-point injection and price correction
 *  3. Scheduled or manually triggered external feed runs
 *
 * All operations are restricted to `super_admin`. Depends on MarketModule to
 * persist price points. Uses two BullMQ queues: `ingestion` for file processing
 * jobs and `coin-price-recompute` to trigger repricing after new data lands.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DataIngestionJob, ExternalFeed]),
    BullModule.registerQueue({ name: 'ingestion' }),
    BullModule.registerQueue({ name: 'coin-price-recompute' }),
    MulterModule.register({ dest: '/tmp/uploads' }),
    MarketModule,
  ],
  providers: [IngestionService, IngestionResolver, IngestionConsumer],
  controllers: [IngestionController],
  exports: [IngestionService],
})
export class IngestionModule {}
