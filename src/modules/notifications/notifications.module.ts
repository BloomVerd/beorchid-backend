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

/**
 * Notifications module — async notification delivery with SSE live-push.
 *
 * Notification pipeline:
 *  1. Any module calls `NotificationsProducer.notify(farmerId, dto, pushToStream?)`.
 *  2. The job lands on the `notifications` BullMQ queue.
 *  3. `NotificationsConsumer` picks it up, persists a `Notification` row via
 *     `NotificationsService.create`, then optionally calls `pushToStream` to
 *     push the record onto the farmer's in-memory `Subject<Notification>`.
 *  4. The SSE endpoint (`GET /notifications/stream?token=<jwt>`) streams
 *     events to the client. JWT is passed as a query param because EventSource
 *     does not support custom headers.
 *
 * `pushToStream` defaults to `false` in `NotificationsProducer.notify()` —
 * pass `true` to enable real-time SSE delivery in addition to DB persistence.
 *
 * Exports `NotificationsService` and `NotificationsProducer` for use by other
 * modules (marketplace, payment, health, etc.).
 */
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
