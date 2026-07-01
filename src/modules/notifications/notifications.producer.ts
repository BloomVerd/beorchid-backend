import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType } from './entities/notification.entity';

export interface NotificationJobData {
  farmerId: string;
  title: string;
  message: string;
  type: NotificationType;
  pushToStream: boolean;
}

/**
 * BullMQ producer for the `notifications` queue. Used by any module that
 * needs to deliver a notification to a farmer.
 *
 * The `pushToStream` flag controls whether the consumer also pushes the
 * persisted notification onto the farmer's live SSE subject. Defaults to
 * `false` (DB-only). Pass `true` for real-time in-app delivery (e.g. offer
 * updates, deal confirmations).
 *
 * @example
 * ```typescript
 * await this.notificationsProducer.notify(
 *   farmerId,
 *   { title: 'New offer', message: '...', type: NotificationType.OFFER },
 *   true, // push to SSE stream
 * );
 * ```
 */
@Injectable()
export class NotificationsProducer {
  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * Enqueues a `create-notification` job. The consumer persists the
   * notification and optionally pushes it to the farmer's SSE stream.
   *
   * @param farmerId     Target farmer ID
   * @param dto          Notification title, message, and type
   * @param pushToStream Whether to also emit onto the live SSE subject (default: false)
   */
  async notify(
    farmerId: string,
    dto: { title: string; message: string; type: NotificationType },
    pushToStream = false,
  ): Promise<void> {
    await this.notificationsQueue.add('create-notification', {
      farmerId,
      ...dto,
      pushToStream,
    } satisfies NotificationJobData);
  }
}
