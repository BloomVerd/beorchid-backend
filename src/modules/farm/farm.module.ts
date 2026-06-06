import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Farm } from './entities/farm.entity';
import { Coordinate } from './entities/coordinate.entity';
import { ImageData } from './entities/image-data.entity';
import { IotDevice } from './entities/iot-device.entity';
import { IotToolCall } from './entities/iot-tool-call.entity';
import { PredictionRange } from '../predictions/entities/prediction-range.entity';
import { FarmService } from './farm.service';
import { FarmResolver } from './farm.resolver';
import { IotController } from './iot.controller';
import { IotPubSubService } from './iot-pubsub.service';
import { JsonScalar } from './scalars/json.scalar';
import { FarmerModule } from '../farmer/farmer.module';
import { PaymentModule } from '../payment/payment.module';
import { JwtStrategy } from 'src/common/strategies';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    PaymentModule,
    TypeOrmModule.forFeature([
      Farm,
      Coordinate,
      ImageData,
      IotDevice,
      IotToolCall,
      PredictionRange,
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
  controllers: [IotController],
  providers: [FarmService, FarmResolver, IotPubSubService, JsonScalar, JwtStrategy],
  exports: [TypeOrmModule, FarmService],
})
export class FarmModule {}
