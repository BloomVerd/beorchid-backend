import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Prediction } from './entities/prediction.entity';
import { PredictionRange } from './entities/prediction-range.entity';
import { PredictionService } from './prediction.service';
import { PredictionResolver } from './prediction.resolver';
import { PredictionRangeService } from './prediction-range.service';
import { PredictionRangeResolver } from './prediction-range.resolver';
import { PredictionProducer } from './prediction.producer';
import { PredictionConsumer } from './prediction.consumer';
import { FarmerModule } from '../farmer/farmer.module';
import { FarmModule } from '../farm/farm.module';
import { JwtStrategy } from 'src/common/strategies';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    FarmModule,
    BullModule.registerQueue({ name: 'prediction-queue' }),
    TypeOrmModule.forFeature([Prediction, PredictionRange]),
    // ImageData is registered in FarmModule; importing FarmModule gives access to its repositories.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  providers: [
    PredictionService,
    PredictionResolver,
    PredictionRangeService,
    PredictionRangeResolver,
    PredictionProducer,
    PredictionConsumer,
    JwtStrategy,
  ],
})
export class PredictionModule {}
