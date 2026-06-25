import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coin } from './entities/coin.entity';
import { CoinPricePoint } from './entities/coin-price-point.entity';
import { MarketService } from '../market/market.service';

@Injectable()
export class CoinPricingService {
  constructor(
    @InjectRepository(Coin) private readonly coinRepo: Repository<Coin>,
    @InjectRepository(CoinPricePoint) private readonly pointRepo: Repository<CoinPricePoint>,
    private readonly marketService: MarketService,
  ) {}

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

  async recomputeForCrop(cropId: string): Promise<void> {
    const coins = await this.coinRepo.find({ where: { cropId } });
    for (const coin of coins) {
      await this.recompute(coin.id);
    }
  }
}
