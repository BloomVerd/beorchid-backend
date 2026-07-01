import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationJobData } from './notifications.producer';

/**
 * BullMQ consumer for the `notifications` queue. Processes
 * `create-notification` jobs enqueued by `NotificationsProducer.notify()`.
 *
 * For each job:
 *  1. Persists a `Notification` row via `NotificationsService.create`.
 *  2. If `pushToStream` is `true`, emits the saved notification onto the
 *     farmer's live SSE `Subject` (if the farmer is currently connected).
 */
@Processor('notifications')
export class NotificationsConsumer extends WorkerHost {
  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  /** Persists the notification and optionally pushes it to the farmer's SSE stream. */
  async process(job: Job<NotificationJobData>): Promise<void> {
    const { farmerId, title, message, type, pushToStream } = job.data;
    const notification = await this.notificationsService.create(farmerId, {
      title,
      message,
      type,
    });
    if (pushToStream) {
      this.notificationsService.pushToStream(farmerId, notification);
    }
  }
}
