import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Enqueues `create-predictions` jobs onto the `prediction-queue` BullMQ queue.
 * Called by `PredictionService` after the weekly limit check passes.
 */
@Injectable()
export class PredictionProducer {
  constructor(
    @InjectQueue('prediction-queue') private readonly predictionQueue: Queue,
  ) {}

  /** Adds a `create-predictions` job for the given farm to the queue. */
  async createPrediction(data: { farmId: string }) {
    await this.predictionQueue.add('create-predictions', data);
  }
}
