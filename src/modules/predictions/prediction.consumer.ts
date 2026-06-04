import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Prediction, RiskLevel } from './entities/prediction.entity';
import { PredictionRange } from './entities/prediction-range.entity';
import { Farm } from '../farm/entities/farm.entity';
import { ImageData, PredictionType } from '../farm/entities/image-data.entity';

interface PredictionJson {
  predictions: Array<{
    image_index: number;
    assessments: Array<{
      prediction_type: string;
      risk_level: string;
    }>;
  }>;
}

@Processor('prediction-queue')
export class PredictionConsumer extends WorkerHost {
  private readonly logger = new Logger(PredictionConsumer.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
  ) {
    super();
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
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

    const userContent: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: this.buildContext(farm, usable) },
    ];

    usable.forEach((img, idx) => {
      userContent.push({
        type: 'text',
        text: `Image ${idx} (lat=${img.lat}, lon=${img.lon}, requested_types=${img.prediction_types.join(',')})`,
      });
      userContent.push({
        type: 'image',
        source: { type: 'url', url: img.url },
      });
    });

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: this.buildSystemPrompt(),
      messages: [{ role: 'user', content: userContent }],
    });

    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('');

    const parsed: PredictionJson = JSON.parse(this.extractJson(rawText));

    const records: Prediction[] = [];
    for (const entry of parsed.predictions) {
      const img = usable[entry.image_index];
      if (!img) continue;
      for (const assessment of entry.assessments) {
        const predType = assessment.prediction_type as PredictionType;
        if (!img.prediction_types.includes(predType)) continue;
        records.push(
          this.predictionRepo.create({
            farm: { id: farmId } as Farm,
            image: { id: img.id } as ImageData,
            lat: img.lat,
            lon: img.lon,
            prediction_type: predType,
            risk_level: (assessment.risk_level as RiskLevel) ?? undefined,
          }),
        );
      }
    }

    if (records.length) {
      await this.predictionRepo.save(records);
    }
  }

  private buildContext(farm: Farm, images: ImageData[]): string {
    return [
      `FARM: ${farm.name} | Crop: ${farm.crop_type}${farm.variety ? ` (${farm.variety})` : ''} | Soil: ${farm.soil_type} | Type: ${farm.farm_type}`,
      `IMAGES: ${images.length} field image(s) to analyse`,
    ].join('\n');
  }

  private buildSystemPrompt(): string {
    return `You are an agricultural AI analyst. You will receive farm metadata and a series of field photographs. For each image, assess the requested prediction types and assign a risk level.

Return ONLY valid JSON — no markdown, no explanation, no code fences. Use this exact shape:
{
  "predictions": [
    {
      "image_index": <integer matching the Image N index>,
      "assessments": [
        {
          "prediction_type": "DISEASE_PREDICTION" | "YIELD_PREDICTION",
          "risk_level": "low" | "moderate" | "high"
        }
      ]
    }
  ]
}

Rules:
- Include one assessments entry for every requested_type listed on that image
- DISEASE_PREDICTION: assess visible disease indicators (lesions, discoloration, blight, wilting)
- YIELD_PREDICTION: assess yield potential (crop density, growth stage, stress signs, canopy health)
- risk_level must be exactly one of: "low", "moderate", "high"
- Only include images you received; do not fabricate image_index values`;
  }

  private extractJson(text: string): string {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    const braceStart = text.indexOf('{');
    const braceEnd = text.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1) {
      return text.slice(braceStart, braceEnd + 1);
    }
    return text.trim();
  }
}
