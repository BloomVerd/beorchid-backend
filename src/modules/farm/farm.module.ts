import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Farm } from './entities/farm.entity';
import { Coordinate } from './entities/coordinate.entity';
import { ImageData } from './entities/image-data.entity';
import { IotDevice } from './entities/iot-device.entity';
import { PredictionRange } from '../predictions/entities/prediction-range.entity';
import { FarmService } from './farm.service';
import { FarmResolver } from './farm.resolver';
import { FarmerModule } from '../farmer/farmer.module';
import { JwtStrategy } from 'common/strategies';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    TypeOrmModule.forFeature([Farm, Coordinate, ImageData, IotDevice, PredictionRange]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  providers: [FarmService, FarmResolver, JwtStrategy],
  exports: [TypeOrmModule],
})
export class FarmModule {}
