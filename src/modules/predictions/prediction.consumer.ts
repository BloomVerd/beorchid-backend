import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Prediction, RiskLevel } from './entities/prediction.entity';
import { PredictionRange } from './entities/prediction-range.entity';
import { CropType, Farm } from '../farm/entities/farm.entity';
import { ImageData, PredictionType } from '../farm/entities/image-data.entity';
import { GrowthStage } from '../health/entities/health.enums';

const GROWTH_STAGE_API_MAP: Record<GrowthStage, string> = {
  [GrowthStage.GERMINATION]: 'germination',
  [GrowthStage.VEGETATIVE]: 'vegetative',
  [GrowthStage.FLOWERING]: 'flowering',
  [GrowthStage.FRUITING]: 'fruiting',
  [GrowthStage.HARVEST]: 'maturation',
};

const CROP_DAYS_TO_MATURITY: Record<CropType, number> = {
  [CropType.MAIZE]: 120,
  [CropType.RICE]: 130,
  [CropType.CASSAVA]: 365,
  [CropType.VEGETABLES]: 90,
};

interface PredictionApiSubplotInput {
  image_url: string;
  latitude: number;
  longitude: number;
  area_ha: number;
}

interface PredictionApiRequest {
  crop: string;
  soil_type: string;
  growth_stage: string;
  subplots: PredictionApiSubplotInput[];
  farm_metadata: {
    farm_size_ha: number;
    latitude: number | null;
    longitude: number | null;
    planting_density: number | null;
    elevation_m: number;
    days_to_maturity: number;
  };
}

interface DiseaseResult {
  predicted_class: string;
  severity: number;
  confidence: number;
}

interface YieldResult {
  water_stress_pct: number;
}

interface SubplotResult {
  latitude: number;
  longitude: number;
  disease?: DiseaseResult;
  yield?: YieldResult;
}

interface PredictionApiResponse {
  subplots: SubplotResult[];
}

@Processor('prediction-queue')
export class PredictionConsumer extends WorkerHost {
  private readonly logger = new Logger(PredictionConsumer.name);
  private readonly predictionBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
  ) {
    super();
    this.predictionBaseUrl = this.configService.get<string>(
      'PREDICTION_BASE_URL',
      'http://localhost:8000',
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'create-predictions') {
      await this.computePredictions(job.data.farmId).catch((err) =>
        this.logger.error(
          `Prediction compute failed for farm ${job.data.farmId}`,
          err,
        ),
      );
    }
  }

  private async computePredictions(farmId: string): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const week = Math.ceil(now.getDate() / 7);
    const dayStart = (week - 1) * 7 + 1;
    const weekStart = new Date(year, month - 1, dayStart, 0, 0, 0, 0);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const dayEnd = week >= 4 ? lastDayOfMonth : week * 7;
    const weekEnd = new Date(year, month - 1, dayEnd, 23, 59, 59, 999);

    const farm = await this.predictionRepo.manager.findOne(Farm, {
      where: { id: farmId },
      relations: ['farm_images'],
    });
    if (!farm) {
      this.logger.warn(`Farm ${farmId} not found — skipping prediction`);
      return;
    }

    const range = await this.predictionRepo.manager.findOne(PredictionRange, {
      where: {
        farm: { id: farmId },
        inserted_at: Between(weekStart, weekEnd),
      },
      relations: ['range_images'],
    });

    const images: ImageData[] = range?.range_images?.length
      ? range.range_images
      : (farm.farm_images ?? []);

    const usable = images.filter((img) => img.prediction_types?.length);
    if (!usable.length) {
      this.logger.warn(`No images with prediction types for farm ${farmId}`);
      return;
    }

    await this.predictionRepo.delete({
      farm: { id: farmId },
      createdAt: Between(weekStart, weekEnd) as any,
    });

    const payload = this.buildApiRequest(farm, usable);
    const apiResponse = await this.callPredictionApi(payload);

    const records: Prediction[] = [];
    for (let i = 0; i < usable.length; i++) {
      const img = usable[i];
      const subplot = apiResponse.subplots[i];
      if (!subplot) {
        this.logger.warn(`No subplot result at index ${i} for farm ${farmId}`);
        continue;
      }

      for (const predType of img.prediction_types) {
        let riskLevel: RiskLevel | undefined;

        if (predType === PredictionType.DISEASE_PREDICTION) {
          if (!subplot.disease) {
            this.logger.warn(
              `Missing disease data for subplot ${i}, image ${img.id}`,
            );
            continue;
          }
          riskLevel = this.deriveDiseasRiskLevel(subplot.disease);
        } else if (predType === PredictionType.YIELD_PREDICTION) {
          if (!subplot.yield) {
            this.logger.warn(
              `Missing yield data for subplot ${i}, image ${img.id}`,
            );
            continue;
          }
          riskLevel = this.deriveYieldRiskLevel(subplot.yield);
        }

        records.push(
          this.predictionRepo.create({
            farm: { id: farmId } as Farm,
            image: { id: img.id } as ImageData,
            lat: subplot.latitude,
            lon: subplot.longitude,
            prediction_type: predType,
            risk_level: riskLevel,
            description: this.buildDescription(predType, subplot, riskLevel),
          }),
        );
      }
    }

    if (records.length) {
      await this.predictionRepo.save(records);
    }
  }

  private buildApiRequest(farm: Farm, images: ImageData[]): PredictionApiRequest {
    const areaPerSubplot = farm.farm_size / images.length;
    return {
      crop: farm.crop_type.charAt(0) + farm.crop_type.slice(1).toLowerCase(),
      soil_type: farm.soil_type?.toLowerCase() ?? 'loam',
      growth_stage: farm.growth_stage ? GROWTH_STAGE_API_MAP[farm.growth_stage] : 'vegetative',
      subplots: images.map((img) => ({
        image_url: img.url,
        latitude: img.lat,
        longitude: img.lon,
        area_ha: areaPerSubplot,
      })),
      farm_metadata: {
        farm_size_ha: farm.farm_size,
        latitude: farm.lat ?? null,
        longitude: farm.lon ?? null,
        planting_density: farm.crop_density ?? null,
        elevation_m: farm.elevation_m ?? 0,
        days_to_maturity: farm.days_to_maturity ?? CROP_DAYS_TO_MATURITY[farm.crop_type],
      },
    };
  }

  private async callPredictionApi(
    payload: PredictionApiRequest,
  ): Promise<PredictionApiResponse> {
    const url = `${this.predictionBaseUrl}/predict?verbose=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Prediction API returned ${response.status}: ${body}`);
    }

    return response.json() as Promise<PredictionApiResponse>;
  }

  private deriveDiseasRiskLevel(disease: DiseaseResult): RiskLevel {
    if (disease.predicted_class === 'healthy') return RiskLevel.LOW;
    return disease.severity >= 0.5 ? RiskLevel.HIGH : RiskLevel.MODERATE;
  }

  private deriveYieldRiskLevel(yieldData: YieldResult): RiskLevel {
    if (yieldData.water_stress_pct < 0.3) return RiskLevel.LOW;
    if (yieldData.water_stress_pct < 0.6) return RiskLevel.MODERATE;
    return RiskLevel.HIGH;
  }

  private buildDescription(
    predType: PredictionType,
    subplot: SubplotResult,
    riskLevel: RiskLevel | undefined,
  ): string {
    if (predType === PredictionType.DISEASE_PREDICTION && subplot.disease) {
      const { predicted_class, severity, confidence } = subplot.disease;
      if (predicted_class === 'healthy') {
        return `Healthy crop detected (confidence ${Math.round(confidence * 100)}%)`;
      }
      const label = predicted_class.replace(/_/g, ' ');
      const titled = label.charAt(0).toUpperCase() + label.slice(1);
      return `${titled} detected — severity ${Math.round(severity * 100)}%, confidence ${Math.round(confidence * 100)}%`;
    }
    if (predType === PredictionType.YIELD_PREDICTION && subplot.yield) {
      const stressPct = Math.round(subplot.yield.water_stress_pct * 100);
      return `Water stress at ${stressPct}% — ${riskLevel ?? 'unknown'} yield risk`;
    }
    return '';
  }
}
