import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PredictionService } from './prediction.service';

@Processor('prediction-queue')
export class PredictionConsumer extends WorkerHost {
  constructor(private readonly predictionService: PredictionService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'create-predictions') {
      await this.predictionService.createPredictions(job.data.farmId);
    }
  }
}
