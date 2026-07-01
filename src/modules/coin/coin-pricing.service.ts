import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coin } from './entities/coin.entity';
import { CoinPricePoint } from './entities/coin-price-point.entity';
import { MarketService } from '../market/market.service';

/**
 * Service responsible for computing and persisting coin prices from market data.
 *
 * Pricing formula:
 * ```
 * multiplier = clamp(
 *   1 + w_trend × normalizedPriceChange
 *     + w_demand × demandFactor
 *     + w_health × normalizedAvgFarmHealth
 *     + w_vol   × volatilityAdjustment,
 *   0.25, 4.0
 * )
 * newPrice = round(basePrice × multiplier)
 * ```
 *
 * Factor sources:
 *  - `normalizedPriceChange` — (avgRecent − avgOlder) / avgOlder, clamped to [-1, 1],
 *    comparing the last 30 days of market prices vs the 30–60-day window.
 *  - `demandFactor` — currently 0 (placeholder for future order-book data).
 *  - `normalizedAvgFarmHealth` — currently 0 (placeholder for health pipeline data).
 *  - `volatilityAdjustment` — negative dampener: −min(1, stddev / avgRecent)
 *    on the last-30-day price series.
 *
 * Per-coin weights (`w_trend`, `w_demand`, `w_health`, `w_vol`) default to
 * `{ 0.3, 0.2, 0.3, 0.2 }` and are configurable on the `Coin` entity.
 */
@Injectable()
export class CoinPricingService {
  constructor(
    @InjectRepository(Coin) private readonly coinRepo: Repository<Coin>,
    @InjectRepository(CoinPricePoint) private readonly pointRepo: Repository<CoinPricePoint>,
    private readonly marketService: MarketService,
  ) {}

  /**
   * Recomputes the price for a single coin, persists a `CoinPricePoint` row,
   * and updates `coin.currentPrice`.
   *
   * @throws NotFoundException if the coin does not exist
   */
  async recompute(coinId: string): Promise<CoinPricePoint> {
    const coin = await this.coinRepo.findOne({ where: { id: coinId } });
    if (!coin) throw new NotFoundException(`Coin ${coinId} not found`);

    const weights = coin.pricingWeights ?? { w_trend: 0.3, w_demand: 0.2, w_health: 0.3, w_vol: 0.2 };

    // Gather inputs
    let normalizedPriceChange = 0;
    let demandFactor = 0;
    let normalizedAvgFarmHealth = 0;
    let volatilityAdjustment = 0;

    if (coin.cropId) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const recent = await this.marketService.getCropPrices(coin.cropId, undefined, thirtyDaysAgo);
      const older  = await this.marketService.getCropPrices(coin.cropId, undefined, sixtyDaysAgo, thirtyDaysAgo);

      const avgRecent = recent.length ? recent.reduce((s, p) => s + Number(p.price), 0) / recent.length : null;
      const avgOlder  = older.length  ? older.reduce((s, p) => s + Number(p.price), 0)  / older.length  : null;

      if (avgRecent !== null && avgOlder !== null && avgOlder > 0) {
        const rawChange = (avgRecent - avgOlder) / avgOlder;
        normalizedPriceChange = Math.max(-1, Math.min(1, rawChange));
      }

      // Simple volatility: stddev of recent prices normalised
      if (recent.length > 1 && avgRecent) {
        const variance = recent.reduce((s, p) => s + Math.pow(Number(p.price) - avgRecent, 2), 0) / recent.length;
        const stddev = Math.sqrt(variance);
        volatilityAdjustment = -Math.min(1, stddev / avgRecent); // negative: dampener
      }
    }

    const multiplier = 1
      + weights['w_trend'] * normalizedPriceChange
      + weights['w_demand'] * demandFactor
      + weights['w_health'] * normalizedAvgFarmHealth
      + weights['w_vol']   * volatilityAdjustment;

    const clampedMultiplier = Math.max(0.25, Math.min(4.0, multiplier));
    const newPrice = Math.round(coin.basePrice * clampedMultiplier);

    const inputs = {
      basePrice: coin.basePrice,
      multiplier: clampedMultiplier,
      normalizedPriceChange,
      demandFactor,
      normalizedAvgFarmHealth,
      volatilityAdjustment,
      weights,
    };

    const point = await this.pointRepo.save(this.pointRepo.create({ coinId, price: newPrice, inputs }));

    coin.currentPrice = newPrice;
    await this.coinRepo.save(coin);

    return point;
  }

  /**
   * Recomputes prices for all coins linked to the given crop. Called by the
   * `coin-price-recompute` consumer when market data for a crop changes.
   */
  async recomputeForCrop(cropId: string): Promise<void> {
    const coins = await this.coinRepo.find({ where: { cropId } });
    for (const coin of coins) {
      await this.recompute(coin.id);
    }
  }
}
