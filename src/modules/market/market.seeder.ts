import { Injectable } from '@nestjs/common';
import { MarketService } from './market.service';
import { PriceType } from './entities/market-price-point.entity';

/**
 * Seeds the market module with initial crop and price data on application
 * startup. Generates two years of weekly wholesale price observations for
 * Maize and Rice across four Ghanaian regions using a random walk around a
 * base price. Seeding is idempotent — it exits immediately if price data for
 * Maize already exists.
 */
@Injectable()
export class MarketSeeder {
  constructor(private readonly marketService: MarketService) {}

  async seed(): Promise<void> {
    const maize = await this.marketService.upsertCrop('Maize', 'maize', 'per 100kg bag');
    const rice = await this.marketService.upsertCrop('Rice', 'rice', 'per 100kg bag');

    const existing = await this.marketService.getCropPrices(maize.id);
    if (existing.length > 0) return; // already seeded

    const now = new Date();
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const crops = [
      { crop: maize, basePriceGhs: 90, variance: 20 },
      { crop: rice,  basePriceGhs: 280, variance: 40 },
    ];

    const regions = ['ashanti', 'northern', 'greater_accra', 'brong_ahafo'];

    for (const { crop, basePriceGhs, variance } of crops) {
      for (const region of regions) {
        const cursor = new Date(twoYearsAgo);
        while (cursor <= now) {
          const priceGhs = basePriceGhs + (Math.random() - 0.5) * variance * 2;
          const pesewas = Math.round(priceGhs * 100);
          await this.marketService.createPricePoint({
            cropId: crop.id,
            region,
            price: pesewas,
            currency: 'GHS',
            observedAt: new Date(cursor),
            source: 'seed',
            priceType: PriceType.WHOLESALE,
            isSuperseded: false,
          });
          cursor.setDate(cursor.getDate() + 7); // weekly points
        }
      }
    }

    console.log('[MarketSeeder] Seeded 2y price history for maize and rice');
  }
}
