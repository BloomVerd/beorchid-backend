/**
 * Farm module — manages farm creation, multi-step setup, image management,
 * and IoT device provisioning on AWS IoT Core.
 *
 * Exports `TypeOrmModule` (so other modules can inject Farm/ImageData/IotDevice
 * repositories) and `FarmService` (used by Chat and other modules that need
 * direct farm operations such as `triggerIotDevice`).
 */
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
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { JwtStrategy } from 'src/common/strategies';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    PaymentModule,
    NotificationsModule,
    EmailModule,
    SmsModule,
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
