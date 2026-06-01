import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FarmHealth } from './entities/farm-health.entity';
import { CropFieldHealth } from './entities/crop-field-health.entity';
import { DiseaseAlert } from './entities/disease-alert.entity';
import { HealthAlert } from './entities/health-alert.entity';
import { SensorHistoryPoint } from './entities/sensor-history-point.entity';
import { YieldComparison } from './entities/yield-comparison.entity';
import { HealthResolver } from './health.resolver';
import { HealthService } from './health.service';
import { FarmerModule } from '../farmer/farmer.module';
import { JwtStrategy } from 'common/strategies';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    TypeOrmModule.forFeature([
      FarmHealth,
      CropFieldHealth,
      DiseaseAlert,
      HealthAlert,
      SensorHistoryPoint,
      YieldComparison,
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
  providers: [HealthResolver, HealthService, JwtStrategy],
  exports: [HealthService],
})
export class HealthModule {}
