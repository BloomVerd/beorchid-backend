import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationJobData } from './notifications.producer';

@Processor('notifications')
export class NotificationsConsumer extends WorkerHost {
  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

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
