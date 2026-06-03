import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { SensorHistoryPoint } from '../health/entities/sensor-history-point.entity';
import { YieldComparison } from '../health/entities/yield-comparison.entity';
import { FarmDataResolver } from './farm-data.resolver';
import { FarmDataService } from './farm-data.service';
import { FarmDataProducer } from './farm-data.producer';
import { FarmDataConsumer } from './farm-data.consumer';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: 'farm-data-queue' }),
    TypeOrmModule.forFeature([
      Farm,
      FarmHealth,
      IotDevice,
      SensorHistoryPoint,
      YieldComparison,
    ]),
  ],
  providers: [
    FarmDataResolver,
    FarmDataService,
    FarmDataProducer,
    FarmDataConsumer,
  ],
})
export class FarmDataModule {}
