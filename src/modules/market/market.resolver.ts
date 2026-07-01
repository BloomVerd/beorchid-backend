import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MarketService } from './market.service';
import { Crop } from './entities/crop.entity';
import { MarketPricePoint } from './entities/market-price-point.entity';
import { PriceForecast } from './entities/price-forecast.entity';
import { MarketSurveyInsight, InsightType } from './entities/market-survey-insight.entity';
import { Coin } from '../coin/entities/coin.entity';
import { PriceDataPoint } from './types/crop-price-series.type';
import { PublishInsightInput } from './inputs/publish-insight.input';
import { PublishForecastInput } from './inputs/publish-forecast.input';
import { CreateCropInput } from './inputs/create-crop.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for the market module. Read queries are publicly accessible
 * with no authentication. Write mutations (`createCrop`, `publishInsight`,
 * `publishForecast`) require a valid JWT and the `super_admin` role.
 */
@Resolver(() => Crop)
export class MarketResolver {
  constructor(private readonly marketService: MarketService) {}

  /** Returns all crops, optionally filtered by category and/or region. */
  @Query(() => [Crop])
  crops(
    @Args('category', { nullable: true }) category?: string,
    @Args('region', { nullable: true }) region?: string,
  ): Promise<Crop[]> {
    return this.marketService.findAllCrops(category, region);
  }

  /** Returns a single crop by ID. */
  @Query(() => Crop)
  crop(@Args('id', { type: () => ID }) id: string): Promise<Crop> {
    return this.marketService.findCropById(id);
  }

  /**
   * Returns non-superseded price observations for a crop. Supports optional
   * filtering by region and an inclusive date range.
   */
  @Query(() => [MarketPricePoint])
  cropPrices(
    @Args('cropId', { type: () => ID }) cropId: string,
    @Args('region', { nullable: true }) region?: string,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
  ): Promise<MarketPricePoint[]> {
    return this.marketService.getCropPrices(cropId, region, from, to);
  }

  /**
   * Returns model-generated price forecasts for a crop in a given region.
   * Optionally filter by forecast horizon in days.
   */
  @Query(() => [PriceForecast])
  cropForecast(
    @Args('cropId', { type: () => ID }) cropId: string,
    @Args('region') region: string,
    @Args('horizonDays', { nullable: true, type: () => Number }) horizonDays?: number,
  ): Promise<PriceForecast[]> {
    return this.marketService.getCropForecast(cropId, region, horizonDays);
  }

  /**
   * Returns published market survey insights ordered by publish date descending.
   * Optionally filter by insight type, crop, or region.
   */
  @Query(() => [MarketSurveyInsight])
  marketInsights(
    @Args('type', { nullable: true, type: () => InsightType }) type?: InsightType,
    @Args('cropId', { nullable: true }) cropId?: string,
    @Args('region', { nullable: true }) region?: string,
  ): Promise<MarketSurveyInsight[]> {
    return this.marketService.getInsights(type, cropId, region);
  }

  /** Returns a single market survey insight by ID. */
  @Query(() => MarketSurveyInsight)
  marketInsight(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MarketSurveyInsight> {
    return this.marketService.getInsightById(id);
  }

  /** Returns the top 10 crops by name. */
  @Query(() => [Crop])
  topCrops(): Promise<Crop[]> {
    return this.marketService.getTopCrops();
  }

  /**
   * Resolves the last 24 non-superseded price points for a crop, ordered by
   * observation date ascending. Used to power price charts on the crop detail page.
   */
  @ResolveField('recentPrices', () => [PriceDataPoint])
  recentPrices(@Parent() crop: Crop): Promise<PriceDataPoint[]> {
    return this.marketService.getRecentPricesForCrop(crop.id);
  }

  /** Resolves the beorchid coin associated with a crop, if one exists. */
  @ResolveField('coin', () => Coin, { nullable: true })
  coin(@Parent() crop: Crop): Promise<Coin | null> {
    return this.marketService.findCoinByCropId(crop.id);
  }

  /**
   * Publishes a market survey insight. Restricted to `super_admin`.
   * Sets `publishedAt` and `authorId` automatically from the current user.
   */
  @Mutation(() => MarketSurveyInsight)
  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  publishInsight(
    @Args('input') input: PublishInsightInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<MarketSurveyInsight> {
    return this.marketService.publishInsight(input, user.id);
  }

  /**
   * Publishes a model-generated price forecast. Restricted to `super_admin`.
   * Sets `generatedAt` automatically.
   */
  @Mutation(() => PriceForecast)
  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  publishForecast(
    @Args('input') input: PublishForecastInput,
  ): Promise<PriceForecast> {
    return this.marketService.publishForecast(input);
  }

  /**
   * Adds a new crop to the catalogue. Restricted to `super_admin`.
   * Auto-generates a slug from the crop name if not provided.
   * Throws 409 if a crop with the same name or slug already exists.
   */
  @Mutation(() => Crop)
  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  createCrop(@Args('input') input: CreateCropInput): Promise<Crop> {
    return this.marketService.createCrop(input);
  }
}
