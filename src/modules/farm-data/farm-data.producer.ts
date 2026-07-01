import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Enqueues `generate-farm-data` jobs onto the `farm-data-queue` BullMQ queue.
 * Called by `FarmDataService` after setting the dedup lock.
 */
@Injectable()
export class FarmDataProducer {
  constructor(
    @InjectQueue('farm-data-queue') private readonly farmDataQueue: Queue,
  ) {}

  /** Adds a `generate-farm-data` job for the given farm to the queue. */
  async enqueue(farmId: string): Promise<void> {
    await this.farmDataQueue.add('generate-farm-data', { farmId });
  }
}
