import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Crop } from './entities/crop.entity';
import { MarketPricePoint } from './entities/market-price-point.entity';
import { PriceForecast } from './entities/price-forecast.entity';
import { MarketSurveyInsight, InsightType } from './entities/market-survey-insight.entity';
import { PublishInsightInput } from './inputs/publish-insight.input';
import { PublishForecastInput } from './inputs/publish-forecast.input';
import { PriceDataPoint } from './types/crop-price-series.type';

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
  ) {}

  findAllCrops(): Promise<Crop[]> {
    return this.cropRepo.find({ order: { name: 'ASC' } });
  }

  async findCropById(id: string): Promise<Crop> {
    const crop = await this.cropRepo.findOne({ where: { id } });
    if (!crop) throw new NotFoundException(`Crop ${id} not found`);
    return crop;
  }

  async findCropBySlug(slug: string): Promise<Crop | null> {
    return this.cropRepo.findOne({ where: { slug } });
  }

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

  async getCropForecast(
    cropId: string,
    region: string,
    horizonDays?: number,
  ): Promise<PriceForecast[]> {
    const where: Record<string, unknown> = { cropId, region };
    if (horizonDays) where['horizonDays'] = horizonDays;
    return this.forecastRepo.find({ where: where as any, order: { generatedAt: 'DESC' } });
  }

  async getInsights(type?: InsightType, cropId?: string, region?: string): Promise<MarketSurveyInsight[]> {
    const where: Record<string, unknown> = {};
    if (type) where['type'] = type;
    if (cropId) where['cropId'] = cropId;
    if (region) where['region'] = region;
    return this.insightRepo.find({ where: where as any, order: { publishedAt: 'DESC' } });
  }

  async getInsightById(id: string): Promise<MarketSurveyInsight> {
    const insight = await this.insightRepo.findOne({ where: { id } });
    if (!insight) throw new NotFoundException(`Insight ${id} not found`);
    return insight;
  }

  async getTopCrops(): Promise<Crop[]> {
    return this.cropRepo.find({ order: { name: 'ASC' }, take: 10 });
  }

  async publishInsight(input: PublishInsightInput, authorId: string): Promise<MarketSurveyInsight> {
    const insight = this.insightRepo.create({
      ...input,
      authorId,
      publishedAt: new Date(),
    });
    return this.insightRepo.save(insight);
  }

  async publishForecast(input: PublishForecastInput): Promise<PriceForecast> {
    const forecast = this.forecastRepo.create({
      ...input,
      generatedAt: new Date(),
    });
    return this.forecastRepo.save(forecast);
  }

  async createPricePoint(data: Partial<MarketPricePoint>): Promise<MarketPricePoint> {
    return this.pricePointRepo.save(this.pricePointRepo.create(data));
  }

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

  async upsertCrop(name: string, slug: string, unit?: string): Promise<Crop> {
    let crop = await this.cropRepo.findOne({ where: { slug } });
    if (!crop) {
      crop = this.cropRepo.create({ name, slug, unit: unit ?? 'per 100kg bag' });
      crop = await this.cropRepo.save(crop);
    }
    return crop;
  }
}
