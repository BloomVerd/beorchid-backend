import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from 'src/common/config/dynamodb.config';
import { createLlmClient, getLlmModel } from 'src/common/config/llm.config';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { YieldComparison } from '../health/entities/yield-comparison.entity';
import { FarmDataService } from './farm-data.service';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import {
  IrrigationSection,
  SensorReading,
  SensorSection,
  YieldSection,
} from './types/farm-data.types';

interface TelemetryItem {
  farm_id: string;
  timestamp: string;
  device_id?: string;
  humidity?: number;
  ph?: number;
  soil_moisture?: number;
  temperature?: number;
}

interface FarmDataJson {
  sensors?: {
    readings: Array<{
      moisture?: number;
      temperature?: number;
      nitrogen?: number;
      phosphorus?: number;
      potassium?: number;
      recorded_at?: string;
    }>;
    summary: string;
  };
  irrigation?: {
    recommendation: string;
    amount_mm?: number;
    urgency_hours?: number;
    next_rainfall?: string;
    badge_text: string;
  };
  yield?: {
    tons_per_ha: number;
    change_percent: number;
    trend: string;
    season: string;
  };
}

@Processor('farm-data-queue')
export class FarmDataConsumer extends WorkerHost {
  private readonly llm: OpenAI;
  private readonly model: string;
  private readonly dynamodb: DynamoDBDocumentClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly farmDataService: FarmDataService,
    private readonly farmerSettingsService: FarmerSettingsService,
    @InjectRepository(Farm) private readonly farmRepo: Repository<Farm>,
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepo: Repository<FarmHealth>,
    @InjectRepository(IotDevice)
    private readonly iotDeviceRepo: Repository<IotDevice>,
    @InjectRepository(YieldComparison)
    private readonly yieldRepo: Repository<YieldComparison>,
  ) {
    super();
    this.llm = createLlmClient(this.configService);
    this.model = getLlmModel(this.configService);
    this.dynamodb = createDynamoDBClient(this.configService);
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'generate-farm-data') return;

    const { farmId } = job.data as { farmId: string };

    try {
      const farm = await this.farmRepo.findOne({
        where: { id: farmId },
        relations: ['farmer'],
      });
      const settings = farm?.farmer
        ? await this.farmerSettingsService.getOrCreate(farm.farmer.id)
        : null;

      const [health, iotDevices, telemetry, yieldComparisons] =
        await Promise.all([
          this.farmHealthRepo.findOne({
            where: { farm: { id: farmId } },
            relations: ['disease_alerts', 'health_alerts'],
            order: { computed_at: 'DESC' },
          }),
          this.iotDeviceRepo.find({ where: { farm: { id: farmId } } }),
          this.queryTelemetry(farmId, settings?.farmDataLookbackSeconds ?? 3600),
          this.yieldRepo.find({
            where: { farmHealth: { farm: { id: farmId } } },
            order: { createdAt: 'DESC' },
            take: 5,
          }),
        ]);

      const context = this.buildContext(farm, health, iotDevices, telemetry, yieldComparisons);

      const completion = await this.llm.chat.completions.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          { role: 'user', content: context },
        ],
      });

      const rawText = completion.choices[0]?.message?.content ?? '';

      const json = this.extractJson(rawText);
      const parsed: FarmDataJson = JSON.parse(json);

      const sensors = parsed.sensors
        ? this.mapSensorSection(parsed.sensors)
        : undefined;
      const irrigation = parsed.irrigation
        ? this.mapIrrigationSection(parsed.irrigation)
        : undefined;
      const yieldSection = parsed.yield
        ? this.mapYieldSection(parsed.yield)
        : undefined;

      await this.farmDataService.cacheResult(
        farmId,
        {
          generated_at: new Date().toISOString(),
          sensors,
          irrigation,
          yield: yieldSection,
        },
        settings?.farmDataCacheTtlSeconds ?? 3600,
      );
    } catch {
      await this.farmDataService.clearPending(farmId);
    }
  }

  private async queryTelemetry(
    farmId: string,
    lookbackSeconds: number,
  ): Promise<TelemetryItem[]> {
    const since = new Date(
      Date.now() - lookbackSeconds * 1000,
    ).toISOString();
    const result = await this.dynamodb.send(
      new QueryCommand({
        TableName: 'farm_telemetry',
        KeyConditionExpression: 'farm_id = :fid AND #ts >= :since',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':fid': farmId, ':since': since },
        ScanIndexForward: false,
        Limit: 100,
      }),
    );
    return (result.Items ?? []) as TelemetryItem[];
  }

  private buildContext(
    farm: Farm | null,
    health: FarmHealth | null,
    iotDevices: IotDevice[],
    telemetry: TelemetryItem[],
    yieldComparisons: YieldComparison[],
  ): string {
    const parts: string[] = [];

    if (farm) {
      parts.push(
        `FARM: ${farm.name} | Crop: ${farm.crop_type}${farm.variety ? ` (${farm.variety})` : ''} | Size: ${farm.farm_size} ${farm.size_unit} | Soil: ${farm.soil_type}`,
      );
    }

    if (health) {
      parts.push(
        `HEALTH SCORES: overall=${health.overall_score}, soil=${health.soil_health}, crop=${health.crop_health}, weather_stress=${health.weather_stress}, disease_risk=${health.disease_risk}`,
      );
      if (health.health_alerts?.length) {
        const alerts = health.health_alerts
          .map((a) => `[${a.severity}] ${a.title}: ${a.description}`)
          .join('; ');
        parts.push(`HEALTH ALERTS: ${alerts}`);
      }
      if (health.disease_alerts?.length) {
        const alerts = health.disease_alerts
          .map((a) => `${a.disease_name} prob=${a.probability} spread=${a.spread}`)
          .join('; ');
        parts.push(`DISEASE ALERTS: ${alerts}`);
      }
    }

    if (telemetry.length) {
      const rows = telemetry
        .map(
          (t) =>
            `soil_moisture=${t.soil_moisture ?? 'n/a'}% humidity=${t.humidity ?? 'n/a'}% temp=${t.temperature ?? 'n/a'}°C ph=${t.ph ?? 'n/a'} device=${t.device_id ?? 'n/a'} at=${t.timestamp}`,
        )
        .join('\n  ');
      parts.push(`SENSOR READINGS (${telemetry.length} points):\n  ${rows}`);
    } else {
      parts.push('SENSOR READINGS: none available');
    }

    if (iotDevices.length) {
      const devices = iotDevices
        .map((d) => `${d.label} (${d.device_type}) active=${d.is_active}`)
        .join('; ');
      parts.push(`IOT DEVICES: ${devices}`);
    } else {
      parts.push('IOT DEVICES: none registered');
    }

    if (yieldComparisons.length) {
      const yields = yieldComparisons
        .map(
          (y) =>
            `field=${y.field_name} current=${y.current_yield} last_season=${y.last_season_yield} confidence=${y.confidence_min}-${y.confidence_max}`,
        )
        .join('; ');
      parts.push(`YIELD DATA: ${yields}`);
    } else {
      parts.push('YIELD DATA: none available');
    }

    return parts.join('\n');
  }

  private buildSystemPrompt(): string {
    return `You are a farm dashboard data analyzer. Given raw farm telemetry data, generate a structured JSON dashboard object.

Return ONLY valid JSON — no markdown, no explanation, no code fences. Use this exact shape:
{
  "sensors": {          // OMIT if no sensor readings in last 1hr
    "readings": [{ "moisture": number, "temperature": number, "nitrogen": number, "phosphorus": number, "potassium": number, "recorded_at": "ISO string" }],
    "summary": "one-sentence plain English summary of sensor state"
  },
  "irrigation": {       // OMIT if no irrigation devices AND no moisture concern
    "recommendation": "plain English recommendation",
    "amount_mm": number or null,
    "urgency_hours": number or null,
    "next_rainfall": "human readable string or null",
    "badge_text": "short label e.g. '25mm needed' or 'OK'"
  },
  "yield": {            // OMIT if no yield comparison data
    "tons_per_ha": number,
    "change_percent": number (positive = increase),
    "trend": "up" | "down" | "stable",
    "season": "short season label e.g. '2026 Long Rains'"
  }
}

Rules:
- Omit any top-level key where data is absent or insufficient to make a meaningful assessment
- For irrigation, derive amount_mm and urgency_hours from soil moisture levels and health scores
- For yield, use the most recent yield comparison; compute change_percent as ((current - last_season) / last_season * 100)
- Keep all strings concise (suitable for a mobile dashboard card)`;
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

  private mapSensorSection(raw: FarmDataJson['sensors']): SensorSection {
    const readings: SensorReading[] = (raw!.readings ?? []).map((r) => ({
      moisture: r.moisture,
      temperature: r.temperature,
      nitrogen: r.nitrogen,
      phosphorus: r.phosphorus,
      potassium: r.potassium,
      recorded_at: r.recorded_at,
    }));
    return { readings, summary: raw!.summary };
  }

  private mapIrrigationSection(
    raw: FarmDataJson['irrigation'],
  ): IrrigationSection {
    return {
      recommendation: raw!.recommendation,
      amount_mm: raw!.amount_mm ?? undefined,
      urgency_hours: raw!.urgency_hours ?? undefined,
      next_rainfall: raw!.next_rainfall ?? undefined,
      badge_text: raw!.badge_text,
    };
  }

  private mapYieldSection(raw: FarmDataJson['yield']): YieldSection {
    return {
      tons_per_ha: raw!.tons_per_ha,
      change_percent: raw!.change_percent,
      trend: raw!.trend,
      season: raw!.season,
    };
  }
}
