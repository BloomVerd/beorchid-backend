import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from 'src/common/config/dynamodb.config';
import { Farm } from '../farm/entities/farm.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { FarmHealth } from './entities/farm-health.entity';
import { CropFieldHealth } from './entities/crop-field-health.entity';
import { DiseaseAlert } from './entities/disease-alert.entity';
import { HealthAlert } from './entities/health-alert.entity';
import { SensorHistoryPoint } from './entities/sensor-history-point.entity';
import { YieldComparison } from './entities/yield-comparison.entity';
import {
  AlertSeverity,
  DiseaseSpread,
  GrowthStage,
} from './entities/health.enums';
import { CropType } from '../farm/entities/farm.entity';

interface HealthJson {
  overall_score: number;
  soil_health: number;
  crop_health: number;
  weather_stress: number;
  disease_risk: number;
  crop_field_health?: Array<{
    field_name: string;
    crop_type: string;
    health_percent: number;
    ndvi: number;
    disease_probability: number;
    disease_type?: string | null;
    growth_stage: string;
    expected_harvest: string;
  }>;
  disease_alerts?: Array<{
    disease_name: string;
    probability: number;
    first_detected: string;
    spread: string;
    treatment: string;
    infected_leaves?: number | null;
  }>;
  health_alerts?: Array<{
    severity: string;
    title: string;
    description: string;
    action: string;
    estimated_impact: string;
  }>;
  sensor_history?: Array<{
    date: string;
    moisture: number;
    temperature: number;
    nitrogen: number;
    phosphorus: number;
    potassium: number;
  }>;
  yield_comparisons?: Array<{
    field_name: string;
    current_yield: number;
    last_season_yield: number;
    confidence_min: number;
    confidence_max: number;
    revenue: number;
  }>;
}

interface TelemetryItem {
  farm_id: string;
  timestamp: string;
  device_id?: string;
  humidity?: number;
  ph?: number;
  soil_moisture?: number;
  temperature?: number;
}

@Processor('health-queue')
export class HealthConsumer extends WorkerHost {
  private readonly logger = new Logger(HealthConsumer.name);
  private readonly anthropic: Anthropic;
  private readonly dynamodb: DynamoDBDocumentClient;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Farm) private readonly farmRepo: Repository<Farm>,
    @InjectRepository(IotDevice)
    private readonly iotDeviceRepo: Repository<IotDevice>,
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepo: Repository<FarmHealth>,
    @InjectRepository(CropFieldHealth)
    private readonly cropFieldHealthRepo: Repository<CropFieldHealth>,
    @InjectRepository(DiseaseAlert)
    private readonly diseaseAlertRepo: Repository<DiseaseAlert>,
    @InjectRepository(HealthAlert)
    private readonly healthAlertRepo: Repository<HealthAlert>,
    @InjectRepository(SensorHistoryPoint)
    private readonly sensorRepo: Repository<SensorHistoryPoint>,
    @InjectRepository(YieldComparison)
    private readonly yieldRepo: Repository<YieldComparison>,
  ) {
    super();
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
    this.dynamodb = createDynamoDBClient(this.configService);
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'compute-health-batch') return;
    const { farmIds } = job.data as { farmIds: string[] };
    await Promise.all(
      farmIds.map((id) =>
        this.computeFarmHealth(id).catch((err) =>
          this.logger.error(`Health compute failed for farm ${id}`, err),
        ),
      ),
    );
  }

  private async computeFarmHealth(farmId: string): Promise<void> {
    const [farm, iotDevices, telemetry, recentYields] = await Promise.all([
      this.farmRepo.findOne({ where: { id: farmId } }),
      this.iotDeviceRepo.find({ where: { farm: { id: farmId } } }),
      this.queryTelemetry(farmId, 24),
      this.yieldRepo.find({
        where: { farmHealth: { farm: { id: farmId } } },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const context = this.buildContext(farm, iotDevices, telemetry, recentYields);

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: this.buildSystemPrompt(),
      messages: [{ role: 'user', content: context }],
    });

    const rawText = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('');

    const json = this.extractJson(rawText);
    const parsed: HealthJson = JSON.parse(json);

    const health = this.farmHealthRepo.create({
      farm: { id: farmId } as Farm,
      overall_score: parsed.overall_score,
      soil_health: parsed.soil_health,
      crop_health: parsed.crop_health,
      weather_stress: parsed.weather_stress,
      disease_risk: parsed.disease_risk,
      computed_at: new Date(),
    });
    const saved = await this.farmHealthRepo.save(health);

    await Promise.all([
      parsed.crop_field_health?.length
        ? this.cropFieldHealthRepo.save(
            parsed.crop_field_health.map((cfh) =>
              this.cropFieldHealthRepo.create({
                field_name: cfh.field_name,
                crop_type: (cfh.crop_type as CropType) ?? CropType.MAIZE,
                health_percent: cfh.health_percent,
                ndvi: cfh.ndvi,
                disease_probability: cfh.disease_probability,
                disease_type: cfh.disease_type ?? undefined,
                growth_stage:
                  (cfh.growth_stage as GrowthStage) ?? GrowthStage.VEGETATIVE,
                expected_harvest: cfh.expected_harvest,
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),

      parsed.disease_alerts?.length
        ? this.diseaseAlertRepo.save(
            parsed.disease_alerts.map((da) =>
              this.diseaseAlertRepo.create({
                disease_name: da.disease_name,
                probability: da.probability,
                first_detected: new Date(da.first_detected),
                spread: (da.spread as DiseaseSpread) ?? DiseaseSpread.STABLE,
                treatment: da.treatment,
                infected_leaves: da.infected_leaves ?? undefined,
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),

      parsed.health_alerts?.length
        ? this.healthAlertRepo.save(
            parsed.health_alerts.map((ha) =>
              this.healthAlertRepo.create({
                severity: (ha.severity as AlertSeverity) ?? AlertSeverity.INFO,
                title: ha.title,
                description: ha.description,
                action: ha.action,
                estimated_impact: ha.estimated_impact,
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),

      parsed.sensor_history?.length
        ? this.sensorRepo.save(
            parsed.sensor_history.map((sp) =>
              this.sensorRepo.create({
                date: sp.date,
                moisture: sp.moisture,
                temperature: sp.temperature,
                nitrogen: sp.nitrogen,
                phosphorus: sp.phosphorus,
                potassium: sp.potassium,
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),

      parsed.yield_comparisons?.length
        ? this.yieldRepo.save(
            parsed.yield_comparisons.map((yc) =>
              this.yieldRepo.create({
                field_name: yc.field_name,
                current_yield: yc.current_yield,
                last_season_yield: yc.last_season_yield,
                confidence_min: yc.confidence_min,
                confidence_max: yc.confidence_max,
                revenue: yc.revenue,
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),
    ]);
  }

  private async queryTelemetry(
    farmId: string,
    lookbackSeconds: number,
  ): Promise<TelemetryItem[]> {
    const since = new Date(Date.now() - lookbackSeconds * 1000).toISOString();
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
    iotDevices: IotDevice[],
    telemetry: TelemetryItem[],
    recentYields: YieldComparison[],
  ): string {
    const parts: string[] = [];

    if (farm) {
      parts.push(
        `FARM: ${farm.name} | Crop: ${farm.crop_type}${farm.variety ? ` (${farm.variety})` : ''} | Size: ${farm.farm_size} ${farm.size_unit} | Soil: ${farm.soil_type} | Type: ${farm.farm_type}`,
      );
    }

    if (telemetry.length) {
      const rows = telemetry
        .map(
          (t) =>
            `soil_moisture=${t.soil_moisture ?? 'n/a'}% humidity=${t.humidity ?? 'n/a'}% temp=${t.temperature ?? 'n/a'}°C ph=${t.ph ?? 'n/a'} device=${t.device_id ?? 'n/a'} at=${t.timestamp}`,
        )
        .join('\n  ');
      parts.push(
        `SENSOR READINGS (last 24h, ${telemetry.length} points):\n  ${rows}`,
      );
    } else {
      parts.push('SENSOR READINGS: none in last 24 hours');
    }

    if (iotDevices.length) {
      const devices = iotDevices
        .map((d) => `${d.label} (${d.device_type}) active=${d.is_active}`)
        .join('; ');
      parts.push(`IOT DEVICES: ${devices}`);
    } else {
      parts.push('IOT DEVICES: none registered');
    }

    if (recentYields.length) {
      const yields = recentYields
        .map(
          (y) =>
            `field=${y.field_name} current=${y.current_yield} last_season=${y.last_season_yield} confidence=${y.confidence_min}-${y.confidence_max} revenue=${y.revenue}`,
        )
        .join('; ');
      parts.push(`YIELD DATA: ${yields}`);
    } else {
      parts.push('YIELD DATA: none available');
    }

    return parts.join('\n');
  }

  private buildSystemPrompt(): string {
    return `You are an agricultural health analyst. Given raw farm telemetry, produce a structured health assessment.

Return ONLY valid JSON — no markdown, no explanation, no code fences. Use this exact shape:
{
  "overall_score": <0-100 float>,
  "soil_health": <0-100 float>,
  "crop_health": <0-100 float>,
  "weather_stress": <0-100 float>,
  "disease_risk": <0-100 float>,
  "crop_field_health": [
    {
      "field_name": "string",
      "crop_type": "MAIZE"|"RICE"|"CASSAVA"|"VEGETABLES",
      "health_percent": <0-100 float>,
      "ndvi": <0-1 float>,
      "disease_probability": <0-1 float>,
      "disease_type": "string or null",
      "growth_stage": "GERMINATION"|"VEGETATIVE"|"FLOWERING"|"FRUITING"|"HARVEST",
      "expected_harvest": "human-readable date string e.g. August 2026"
    }
  ],
  "disease_alerts": [
    {
      "disease_name": "string",
      "probability": <0-1 float>,
      "first_detected": "ISO 8601 date string",
      "spread": "INCREASING"|"STABLE"|"DECREASING",
      "treatment": "actionable plain-English recommendation",
      "infected_leaves": <integer or null>
    }
  ],
  "health_alerts": [
    {
      "severity": "INFO"|"WARNING"|"CRITICAL",
      "title": "short title max 60 chars",
      "description": "one sentence",
      "action": "one sentence recommended action",
      "estimated_impact": "brief impact e.g. 10-15% yield reduction"
    }
  ],
  "sensor_history": [
    {
      "date": "YYYY-MM-DD",
      "moisture": <float>,
      "temperature": <float>,
      "nitrogen": <float>,
      "phosphorus": <float>,
      "potassium": <float>
    }
  ],
  "yield_comparisons": [
    {
      "field_name": "string",
      "current_yield": <float tons/ha>,
      "last_season_yield": <float tons/ha>,
      "confidence_min": <float>,
      "confidence_max": <float>,
      "revenue": <float USD>
    }
  ]
}

Rules:
- All scores are floats on a 0-100 scale (higher = healthier/better), except weather_stress (0=no stress, 100=extreme stress) and disease_risk (0-100 risk)
- Always include at least one entry in crop_field_health derived from the farm crop type
- Omit disease_alerts and health_alerts arrays only if there are genuinely none
- Keep all string values concise and suitable for a mobile UI card`;
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
