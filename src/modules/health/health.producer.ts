import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class HealthProducer {
  constructor(@InjectQueue('health-queue') private readonly queue: Queue) {}

  async enqueueBatch(farmIds: string[]): Promise<void> {
    await this.queue.add('compute-health-batch', { farmIds });
  }
}
