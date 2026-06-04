import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
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
import { Prediction } from '../predictions/entities/prediction.entity';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { FarmService } from '../farm/farm.service';
import { IotCommandType } from '../farm/entities/iot-tool-call.entity';

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
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    private readonly farmerSettingsService: FarmerSettingsService,
    private readonly farmService: FarmService,
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
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const farm = await this.farmRepo.findOne({
      where: { id: farmId },
      relations: ['farmer'],
    });
    const settings = farm?.farmer
      ? await this.farmerSettingsService.getOrCreate(farm.farmer.id)
      : null;
    const lookbackSeconds = settings?.farmDataLookbackSeconds ?? 3600;

    const [
      iotDevices,
      telemetry,
      recentYields,
      weekPredictions,
      sensorHistory,
    ] = await Promise.all([
      this.iotDeviceRepo.find({ where: { farm: { id: farmId } } }),
      this.queryTelemetry(farmId, lookbackSeconds),
      this.yieldRepo.find({
        where: { farmHealth: { farm: { id: farmId } } },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.predictionRepo.find({
        where: { farm: { id: farmId }, createdAt: Between(weekStart, weekEnd) },
      }),
      this.sensorRepo.find({
        where: { farmHealth: { farm: { id: farmId } } },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const context = this.buildContext(
      farm,
      iotDevices,
      telemetry,
      recentYields,
      weekPredictions,
      sensorHistory,
    );

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: context },
    ];
    let rawText = '';

    for (let round = 0; round < 5; round++) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: this.buildSystemPrompt(),
        tools: [this.buildIotDeviceTool()],
        messages,
      });

      const textBlocks = response.content.filter((b) => b.type === 'text');
      if (textBlocks.length) {
        rawText = textBlocks
          .map((b) => (b as Anthropic.TextBlock).text)
          .join('');
      }

      if (response.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        response.content
          .filter((b) => b.type === 'tool_use')
          .map(async (block) => {
            const toolUse = block as Anthropic.ToolUseBlock;
            const input = toolUse.input as {
              device_id: string;
              command_type: string;
              parameters?: Record<string, unknown>;
            };
            let content: string;
            try {
              const toolCall = await this.farmService.triggerIotDevice(
                farm?.farmer?.id ?? null,
                farmId,
                input.device_id,
                {
                  command_type: input.command_type as IotCommandType,
                  parameters: input.parameters,
                },
              );
              content = `Command dispatched: tool_call_id=${toolCall.id} status=${toolCall.status}`;
            } catch (err) {
              content = `Error: ${(err as Error).message}`;
            }
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content,
            };
          }),
      );

      messages.push({ role: 'user', content: toolResults });
    }

    const json = this.extractJson(rawText);
    const parsed: HealthJson = JSON.parse(json);

    const health = this.farmHealthRepo.create({
      farm: { id: farmId } as Farm,
      overall_score: parsed.overall_score ?? 0,
      soil_health: parsed.soil_health ?? 0,
      crop_health: parsed.crop_health ?? 0,
      weather_stress: parsed.weather_stress ?? 0,
      disease_risk: parsed.disease_risk ?? 0,
      computed_at: new Date(),
    });
    const saved = await this.farmHealthRepo.save(health);

    await Promise.all([
      parsed.crop_field_health?.length
        ? this.cropFieldHealthRepo.save(
            parsed.crop_field_health.map((cfh) =>
              this.cropFieldHealthRepo.create({
                field_name: cfh.field_name ?? '',
                crop_type: (cfh.crop_type as CropType) ?? CropType.MAIZE,
                health_percent: cfh.health_percent ?? 0,
                ndvi: cfh.ndvi ?? 0,
                disease_probability: cfh.disease_probability ?? 0,
                disease_type: cfh.disease_type ?? undefined,
                growth_stage:
                  (cfh.growth_stage as GrowthStage) ?? GrowthStage.VEGETATIVE,
                expected_harvest: cfh.expected_harvest ?? '',
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),

      parsed.disease_alerts?.length
        ? this.diseaseAlertRepo.save(
            parsed.disease_alerts.map((da) =>
              this.diseaseAlertRepo.create({
                disease_name: da.disease_name ?? '',
                probability: da.probability ?? 0,
                first_detected: new Date(da.first_detected ?? Date.now()),
                spread: (da.spread as DiseaseSpread) ?? DiseaseSpread.STABLE,
                treatment: da.treatment ?? '',
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
                title: ha.title ?? '',
                description: ha.description ?? '',
                action: ha.action ?? '',
                estimated_impact: ha.estimated_impact ?? '',
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),

      parsed.sensor_history?.length
        ? this.sensorRepo.save(
            parsed.sensor_history.map((sp) =>
              this.sensorRepo.create({
                date: sp.date ?? new Date().toISOString().split('T')[0],
                moisture: sp.moisture ?? 0,
                temperature: sp.temperature ?? 0,
                nitrogen: sp.nitrogen ?? 0,
                phosphorus: sp.phosphorus ?? 0,
                potassium: sp.potassium ?? 0,
                farmHealth: saved,
              }),
            ),
          )
        : Promise.resolve(),

      parsed.yield_comparisons?.length
        ? this.yieldRepo.save(
            parsed.yield_comparisons.map((yc) =>
              this.yieldRepo.create({
                field_name: yc.field_name ?? '',
                current_yield: yc.current_yield ?? 0,
                last_season_yield: yc.last_season_yield ?? 0,
                confidence_min: yc.confidence_min ?? 0,
                confidence_max: yc.confidence_max ?? 0,
                revenue: yc.revenue ?? 0,
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
    weekPredictions: Prediction[],
    sensorHistory: SensorHistoryPoint[],
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
        .map(
          (d) =>
            `id=${d.id} label=${d.label} type=${d.device_type} active=${d.is_active}`,
        )
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

    if (weekPredictions.length) {
      const preds = weekPredictions
        .map(
          (p) =>
            `type=${p.prediction_type} risk=${p.risk_level ?? 'n/a'} at=${p.lat},${p.lon} on=${p.createdAt.toISOString().split('T')[0]}`,
        )
        .join('; ');
      parts.push(`WEEKLY PREDICTIONS (${weekPredictions.length}): ${preds}`);
    } else {
      parts.push('WEEKLY PREDICTIONS: none this week');
    }

    if (sensorHistory.length) {
      const hist = sensorHistory
        .map(
          (s) =>
            `date=${s.date} moisture=${s.moisture} temp=${s.temperature} N=${s.nitrogen} P=${s.phosphorus} K=${s.potassium}`,
        )
        .join('; ');
      parts.push(
        `SENSOR HISTORY (last ${sensorHistory.length} assessments): ${hist}`,
      );
    } else {
      parts.push('SENSOR HISTORY: none available');
    }

    return parts.join('\n');
  }

  private buildIotDeviceTool(): Anthropic.Tool {
    return {
      name: 'trigger_iot_device',
      description:
        'Trigger a command on a registered IoT device. Use this to act on analysis findings — e.g. start irrigation when soil moisture is critically low, capture a field image when disease probability is high. Only trigger devices listed as active in the context.',
      input_schema: {
        type: 'object' as const,
        properties: {
          device_id: {
            type: 'string',
            description:
              'The id field of the IoT device from the IOT DEVICES context',
          },
          command_type: {
            type: 'string',
            enum: Object.values(IotCommandType),
            description: 'Command to send to the device',
          },
          parameters: {
            type: 'object',
            description:
              'Optional command parameters (e.g. { "duration_minutes": 30 } for irrigation)',
          },
        },
        required: ['device_id', 'command_type'],
      },
    };
  }

  private buildSystemPrompt(): string {
    return `You are an agricultural health analyst. Given raw farm telemetry, weekly AI predictions, and historical sensor data, produce a structured health assessment.

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
- Keep all string values concise and suitable for a mobile UI card
- Factor in WEEKLY PREDICTIONS when computing disease_risk and health_alerts (HIGH risk predictions raise disease_risk)
- Use SENSOR HISTORY to identify moisture and nutrient trends when live sensor readings are sparse
- Use the trigger_iot_device tool before finalising your assessment when conditions warrant immediate action (e.g. soil moisture critically low → IRRIGATE, high disease probability → CAPTURE_IMAGE). Only call it for active devices.`;
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
