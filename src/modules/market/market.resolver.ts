import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MarketService } from './market.service';
import { Crop } from './entities/crop.entity';
import { MarketPricePoint } from './entities/market-price-point.entity';
import { PriceForecast } from './entities/price-forecast.entity';
import { MarketSurveyInsight, InsightType } from './entities/market-survey-insight.entity';
import { PublishInsightInput } from './inputs/publish-insight.input';
import { PublishForecastInput } from './inputs/publish-forecast.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver()
export class MarketResolver {
  constructor(private readonly marketService: MarketService) {}

  @Query(() => [Crop])
  crops(): Promise<Crop[]> {
    return this.marketService.findAllCrops();
  }

  @Query(() => Crop)
  crop(@Args('id', { type: () => ID }) id: string): Promise<Crop> {
    return this.marketService.findCropById(id);
  }

  @Query(() => [MarketPricePoint])
  cropPrices(
    @Args('cropId', { type: () => ID }) cropId: string,
    @Args('region', { nullable: true }) region?: string,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
  ): Promise<MarketPricePoint[]> {
    return this.marketService.getCropPrices(cropId, region, from, to);
  }

  @Query(() => [PriceForecast])
  cropForecast(
    @Args('cropId', { type: () => ID }) cropId: string,
    @Args('region') region: string,
    @Args('horizonDays', { nullable: true, type: () => Number }) horizonDays?: number,
  ): Promise<PriceForecast[]> {
    return this.marketService.getCropForecast(cropId, region, horizonDays);
  }

  @Query(() => [MarketSurveyInsight])
  marketInsights(
    @Args('type', { nullable: true, type: () => InsightType }) type?: InsightType,
    @Args('cropId', { nullable: true }) cropId?: string,
    @Args('region', { nullable: true }) region?: string,
  ): Promise<MarketSurveyInsight[]> {
    return this.marketService.getInsights(type, cropId, region);
  }

  @Query(() => MarketSurveyInsight)
  marketInsight(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MarketSurveyInsight> {
    return this.marketService.getInsightById(id);
  }

  @Query(() => [Crop])
  topCrops(): Promise<Crop[]> {
    return this.marketService.getTopCrops();
  }

  @Mutation(() => MarketSurveyInsight)
  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  publishInsight(
    @Args('input') input: PublishInsightInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<MarketSurveyInsight> {
    return this.marketService.publishInsight(input, user.id);
  }

  @Mutation(() => PriceForecast)
  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  publishForecast(
    @Args('input') input: PublishForecastInput,
  ): Promise<PriceForecast> {
    return this.marketService.publishForecast(input);
  }
}
