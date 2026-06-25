import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { FieldObservation } from './entities/field-observation.entity';
import { FieldAgentCapability } from './entities/field-agent-capability.entity';
import { FieldService } from './field.service';
import { FieldResolver } from './field.resolver';
import { MarketModule } from '../market/market.module';
import { Farmer } from '../farmer/entities/farmer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([FieldObservation, FieldAgentCapability, Farmer]),
    BullModule.registerQueue({ name: 'coin-price-recompute' }),
    MarketModule,
  ],
  providers: [FieldService, FieldResolver],
  exports: [FieldService],
})
export class FieldModule {}
