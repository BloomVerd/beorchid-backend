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

@Injectable()
export class NotificationsProducer {
  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

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
