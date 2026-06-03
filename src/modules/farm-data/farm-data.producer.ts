import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class FarmDataProducer {
  constructor(
    @InjectQueue('farm-data-queue') private readonly farmDataQueue: Queue,
  ) {}

  async enqueue(farmId: string): Promise<void> {
    await this.farmDataQueue.add('generate-farm-data', { farmId });
  }
}
