import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FarmHealth } from './entities/farm-health.entity';
import { CropFieldHealth } from './entities/crop-field-health.entity';
import { DiseaseAlert } from './entities/disease-alert.entity';
import { HealthAlert } from './entities/health-alert.entity';
import { SensorHistoryPoint } from './entities/sensor-history-point.entity';
import { YieldComparison } from './entities/yield-comparison.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { HealthResolver } from './health.resolver';
import { HealthService } from './health.service';
import { WeatherService } from './weather.service';
import { HealthProducer } from './health.producer';
import { HealthScheduler } from './health.scheduler';
import { HealthConsumer } from './health.consumer';
import { FarmerModule } from '../farmer/farmer.module';
import { FarmModule } from '../farm/farm.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { JwtStrategy } from 'src/common/strategies';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    FarmModule,
    NotificationsModule,
    EmailModule,
    SmsModule,
    BullModule.registerQueue({ name: 'health-queue' }),
    TypeOrmModule.forFeature([
      FarmHealth,
      CropFieldHealth,
      DiseaseAlert,
      HealthAlert,
      SensorHistoryPoint,
      YieldComparison,
      Prediction,
    ]),
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
    HealthResolver,
    HealthService,
    WeatherService,
    HealthProducer,
    HealthScheduler,
    HealthConsumer,
    JwtStrategy,
  ],
  exports: [HealthService],
})
export class HealthModule {}
