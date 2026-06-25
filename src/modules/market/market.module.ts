import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Crop } from './entities/crop.entity';
import { MarketPricePoint } from './entities/market-price-point.entity';
import { PriceForecast } from './entities/price-forecast.entity';
import { MarketSurveyInsight } from './entities/market-survey-insight.entity';
import { MarketService } from './market.service';
import { MarketResolver } from './market.resolver';
import { MarketSeeder } from './market.seeder';

@Module({
  imports: [TypeOrmModule.forFeature([Crop, MarketPricePoint, PriceForecast, MarketSurveyInsight])],
  providers: [MarketService, MarketResolver, MarketSeeder],
  exports: [MarketService, MarketSeeder],
})
export class MarketModule {}
