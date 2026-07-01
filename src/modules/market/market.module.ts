import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Crop } from './entities/crop.entity';
import { MarketPricePoint } from './entities/market-price-point.entity';
import { PriceForecast } from './entities/price-forecast.entity';
import { MarketSurveyInsight } from './entities/market-survey-insight.entity';
import { Coin } from '../coin/entities/coin.entity';
import { MarketService } from './market.service';
import { MarketResolver } from './market.resolver';
import { MarketSeeder } from './market.seeder';

/**
 * Market module — provides crop price intelligence including historical price
 * observations, AI-generated forecasts, and editorial market survey insights.
 *
 * Read queries are public. Write mutations require the `super_admin` role.
 * Exports `MarketService` and `MarketSeeder` for use by other modules.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Crop,
      MarketPricePoint,
      PriceForecast,
      MarketSurveyInsight,
      Coin,
    ]),
  ],
  providers: [MarketService, MarketResolver, MarketSeeder],
  exports: [MarketService, MarketSeeder],
})
export class MarketModule {}
