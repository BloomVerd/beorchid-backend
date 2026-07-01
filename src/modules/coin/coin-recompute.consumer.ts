import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CoinPricingService } from './coin-pricing.service';

/**
 * BullMQ consumer for the `coin-price-recompute` queue. Triggered whenever
 * new market price data lands (via field observation approval, admin injection,
 * or price correction). Routes to the appropriate `CoinPricingService` method
 * based on the job payload:
 *
 *  - `{ coinId }` — recompute a single coin
 *  - `{ cropId }` — recompute all coins linked to the crop
 */
@Processor('coin-price-recompute')
export class CoinRecomputeConsumer extends WorkerHost {
  constructor(private readonly pricingService: CoinPricingService) {
    super();
  }

  /** Dispatches to `recompute(coinId)` or `recomputeForCrop(cropId)` based on the job payload. */
  async process(job: Job<{ coinId?: string; cropId?: string }>): Promise<void> {
    const { coinId, cropId } = job.data;
    if (coinId) {
      await this.pricingService.recompute(coinId);
    } else if (cropId) {
      await this.pricingService.recomputeForCrop(cropId);
    }
  }
}
