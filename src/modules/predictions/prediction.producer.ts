import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class PredictionProducer {
  constructor(
    @InjectQueue('prediction-queue') private readonly predictionQueue: Queue,
  ) {}

  async createPrediction(data: { farmId: string }) {
    await this.predictionQueue.add('create-predictions', data);
  }
}
