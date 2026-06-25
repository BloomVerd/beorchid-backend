import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CoinPricingService } from './coin-pricing.service';

@Processor('coin-price-recompute')
export class CoinRecomputeConsumer extends WorkerHost {
  constructor(private readonly pricingService: CoinPricingService) {
    super();
  }

  async process(job: Job<{ coinId?: string; cropId?: string }>): Promise<void> {
    const { coinId, cropId } = job.data;
    if (coinId) {
      await this.pricingService.recompute(coinId);
    } else if (cropId) {
      await this.pricingService.recomputeForCrop(cropId);
    }
  }
}
