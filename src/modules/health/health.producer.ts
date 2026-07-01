import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Enqueues `compute-health-batch` jobs onto the `health-queue` BullMQ queue.
 * Each job carries a batch of farm IDs so a single worker invocation covers
 * up to 50 farms in parallel.
 */
@Injectable()
export class HealthProducer {
  constructor(@InjectQueue('health-queue') private readonly queue: Queue) {}

  /** Adds a `compute-health-batch` job carrying the given farm IDs to the queue. */
  async enqueueBatch(farmIds: string[]): Promise<void> {
    await this.queue.add('compute-health-batch', { farmIds });
  }
}
