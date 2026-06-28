import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsController } from './notifications.controller';
import { NotificationsProducer } from './notifications.producer';
import { NotificationsConsumer } from './notifications.consumer';
import { FarmerModule } from '../farmer/farmer.module';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({ name: 'notifications' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  providers: [NotificationsService, NotificationsResolver, NotificationsProducer, NotificationsConsumer],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationsProducer],
})
export class NotificationsModule {}
