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
