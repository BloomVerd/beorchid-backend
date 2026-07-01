import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Crop } from './entities/crop.entity';
import { MarketPricePoint } from './entities/market-price-point.entity';
import { PriceForecast } from './entities/price-forecast.entity';
import { MarketSurveyInsight, InsightType } from './entities/market-survey-insight.entity';
import { Coin } from '../coin/entities/coin.entity';
import { PublishInsightInput } from './inputs/publish-insight.input';
import { PublishForecastInput } from './inputs/publish-forecast.input';
import { CreateCropInput } from './inputs/create-crop.input';
import { PriceDataPoint } from './types/crop-price-series.type';

/**
 * Service for crop price intelligence. Manages the crop catalogue, historical
 * price observations, model-generated forecasts, and editorial market insights.
 *
 * All price values are denominated in pesewas (GHS × 100).
 */
@Injectable()
export class MarketService {
  constructor(
    @InjectRepository(Crop)
    private readonly cropRepo: Repository<Crop>,
    @InjectRepository(MarketPricePoint)
    private readonly pricePointRepo: Repository<MarketPricePoint>,
    @InjectRepository(PriceForecast)
    private readonly forecastRepo: Repository<PriceForecast>,
    @InjectRepository(MarketSurveyInsight)
    private readonly insightRepo: Repository<MarketSurveyInsight>,
    @InjectRepository(Coin)
    private readonly coinRepo: Repository<Coin>,
  ) {}

  /** Returns all crops ordered alphabetically. Optionally filtered by category and/or region. */
  findAllCrops(category?: string, region?: string): Promise<Crop[]> {
    const where: Record<string, unknown> = {};
    if (category) where['category'] = category;
    if (region) where['region'] = region;
    return this.cropRepo.find({ where, order: { name: 'ASC' } });
  }

  /** Returns a single crop by ID. Throws 404 if not found. */
  async findCropById(id: string): Promise<Crop> {
    const crop = await this.cropRepo.findOne({ where: { id } });
    if (!crop) throw new NotFoundException(`Crop ${id} not found`);
    return crop;
  }

  /** Returns a single crop by its URL-safe slug, or null if none exists. */
  async findCropBySlug(slug: string): Promise<Crop | null> {
    return this.cropRepo.findOne({ where: { slug } });
  }

  /**
   * Returns non-superseded price points for a crop. Supports optional
   * filtering by region and an inclusive date range (`from` / `to`).
   * Results are ordered by `observedAt` ascending for charting.
   */
  async getCropPrices(
    cropId: string,
    region?: string,
    from?: Date,
    to?: Date,
  ): Promise<MarketPricePoint[]> {
    const where: Record<string, unknown> = { cropId, isSuperseded: false };
    if (region) where['region'] = region;
    if (from && to) where['observedAt'] = Between(from, to);
    else if (from) where['observedAt'] = MoreThanOrEqual(from);
    else if (to) where['observedAt'] = LessThanOrEqual(to);

    return this.pricePointRepo.find({
      where: where as any,
      order: { observedAt: 'ASC' },
    });
  }

  /**
   * Returns price forecasts for a crop in a given region, optionally filtered
   * by forecast horizon. Results are ordered by `generatedAt` descending so
   * the most recent model run appears first.
   */
  async getCropForecast(
    cropId: string,
    region: string,
    horizonDays?: number,
  ): Promise<PriceForecast[]> {
    const where: Record<string, unknown> = { cropId, region };
    if (horizonDays) where['horizonDays'] = horizonDays;
    return this.forecastRepo.find({ where: where as any, order: { generatedAt: 'DESC' } });
  }

  /**
   * Returns published market survey insights ordered by `publishedAt` descending.
   * Optionally filtered by insight type, crop, or region.
   */
  async getInsights(type?: InsightType, cropId?: string, region?: string): Promise<MarketSurveyInsight[]> {
    const where: Record<string, unknown> = {};
    if (type) where['type'] = type;
    if (cropId) where['cropId'] = cropId;
    if (region) where['region'] = region;
    return this.insightRepo.find({ where: where as any, order: { publishedAt: 'DESC' } });
  }

  /** Returns a single market survey insight by ID. Throws 404 if not found. */
  async getInsightById(id: string): Promise<MarketSurveyInsight> {
    const insight = await this.insightRepo.findOne({ where: { id } });
    if (!insight) throw new NotFoundException(`Insight ${id} not found`);
    return insight;
  }

  /** Returns the top 10 crops ordered alphabetically. */
  async getTopCrops(): Promise<Crop[]> {
    return this.cropRepo.find({ order: { name: 'ASC' }, take: 10 });
  }

  /**
   * Publishes a market survey insight authored by the given user. Sets
   * `publishedAt` to the current timestamp automatically.
   */
  async publishInsight(input: PublishInsightInput, authorId: string): Promise<MarketSurveyInsight> {
    const insight = this.insightRepo.create({
      ...input,
      authorId,
      publishedAt: new Date(),
    });
    return this.insightRepo.save(insight);
  }

  /**
   * Publishes a price forecast generated by a pricing model. Sets `generatedAt`
   * to the current timestamp automatically.
   */
  async publishForecast(input: PublishForecastInput): Promise<PriceForecast> {
    const forecast = this.forecastRepo.create({
      ...input,
      generatedAt: new Date(),
    });
    return this.forecastRepo.save(forecast);
  }

  /**
   * Persists a raw price observation. Called by ingestion jobs and the field
   * observation pipeline. Partial data is accepted; the caller is responsible
   * for setting `isSuperseded` and `supersededBy` when correcting a prior entry.
   */
  async createPricePoint(data: Partial<MarketPricePoint>): Promise<MarketPricePoint> {
    return this.pricePointRepo.save(this.pricePointRepo.create(data));
  }

  /**
   * Returns the most recent non-superseded price points for a crop, ordered by
   * `observedAt` ascending. Used as the data source for the `recentPrices`
   * resolved field on `Crop`. Defaults to the last 24 observations.
   */
  async getRecentPricesForCrop(cropId: string, limit = 24): Promise<PriceDataPoint[]> {
    const pts = await this.pricePointRepo.find({
      where: { cropId, isSuperseded: false },
      order: { observedAt: 'ASC' },
      take: limit,
    });
    return pts.map(p => ({
      observedAt: p.observedAt,
      price: Number(p.price),
      currency: p.currency,
      priceType: p.priceType,
      source: p.source,
    }));
  }

  /**
   * Adds a new crop to the catalogue. Auto-generates a URL-safe slug from the
   * name if one is not provided. Throws 409 if a crop with the same name or
   * slug already exists.
   */
  async createCrop(input: CreateCropInput): Promise<Crop> {
    const slug = input.slug ?? input.name.toLowerCase().replace(/\s+/g, '-');
    const existing = await this.cropRepo.findOne({
      where: [{ name: input.name }, { slug }],
    });
    if (existing) throw new ConflictException(`Crop "${input.name}" already exists`);

    const crop = this.cropRepo.create({
      name: input.name,
      slug,
      unit: input.unit ?? 'per 100kg bag',
      category: input.category ?? null,
      region: input.region ?? null,
    });
    return this.cropRepo.save(crop);
  }

  /**
   * Finds a crop by slug, creating it if it does not exist. Used by the seeder
   * and ingestion pipelines to ensure idempotent crop registration.
   */
  async upsertCrop(name: string, slug: string, unit?: string): Promise<Crop> {
    let crop = await this.cropRepo.findOne({ where: { slug } });
    if (!crop) {
      crop = this.cropRepo.create({ name, slug, unit: unit ?? 'per 100kg bag' });
      crop = await this.cropRepo.save(crop);
    }
    return crop;
  }

  /** Returns the beorchid coin associated with a crop, or null if none exists. */
  findCoinByCropId(cropId: string): Promise<Coin | null> {
    return this.coinRepo.findOne({ where: { cropId } });
  }
}
