import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBClient } from 'src/common/config/dynamodb.config';
import { createLlmClient, getLlmModel } from 'src/common/config/llm.config';
import { Farm } from '../farm/entities/farm.entity';
import { DeviceStatus, IotDevice } from '../farm/entities/iot-device.entity';
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
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { EmailProducer } from '../email/email.producer';
import { SmsService } from '../sms/sms.service';

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
  private readonly llm: OpenAI;
  private readonly model: string;
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
    private readonly notificationsService: NotificationsService,
    private readonly emailProducer: EmailProducer,
    private readonly smsService: SmsService,
  ) {
    super();
    this.llm = createLlmClient(this.configService);
    this.model = getLlmModel(this.configService);
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

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: context },
    ];
    let rawText = '';

    for (let round = 0; round < 5; round++) {
      const response = await this.llm.chat.completions.create({
        model: this.model,
        max_tokens: 2048,
        tools: [this.buildIotDeviceTool()],
        messages,
      });

      const choice = response.choices[0];
      const message = choice?.message;
      if (message?.content) rawText = message.content;

      const toolCalls = (message?.tool_calls ?? []).filter(
        (tc) => tc.type === 'function',
      );

      if (choice?.finish_reason !== 'tool_calls' || !toolCalls.length) break;

      messages.push(message);

      const toolResults: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] =
        await Promise.all(
          toolCalls.map(async (toolCall) => {
            let input: {
              device_id: string;
              command_type: string;
              parameters?: Record<string, unknown>;
            };
            try {
              input = JSON.parse(toolCall.function.arguments || '{}');
            } catch {
              input = { device_id: '', command_type: '' };
            }
            let content: string;
            try {
              const dispatched = await this.farmService.triggerIotDevice(
                farm?.farmer?.id ?? null,
                farmId,
                input.device_id,
                {
                  command_type: input.command_type as IotCommandType,
                  parameters: input.parameters,
                },
              );
              content = `Command dispatched: tool_call_id=${dispatched.id} status=${dispatched.status}`;
            } catch (err) {
              content = `Error: ${(err as Error).message}`;
            }
            return {
              role: 'tool' as const,
              tool_call_id: toolCall.id,
              content,
            };
          }),
        );

      messages.push(...toolResults);
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

    if (iotDevices.length) {
      const activeDeviceIds = new Set(
        telemetry.map((t) => t.device_id).filter(Boolean),
      );
      await this.iotDeviceRepo.save(
        iotDevices.map((device) => ({
          ...device,
          status: !device.is_active
            ? DeviceStatus.INACTIVE
            : activeDeviceIds.has(device.device_id)
              ? DeviceStatus.ONLINE
              : DeviceStatus.OFFLINE,
        })),
      );
    }

    await this.dispatchHealthNotifications(
      farm,
      settings,
      saved,
      parsed.disease_alerts ?? [],
      parsed.health_alerts ?? [],
    );
  }

  private async dispatchHealthNotifications(
    farm: Farm | null,
    settings: Awaited<ReturnType<FarmerSettingsService['getOrCreate']>> | null,
    health: FarmHealth,
    diseaseAlerts: HealthJson['disease_alerts'],
    healthAlerts: HealthJson['health_alerts'],
  ): Promise<void> {
    if (!farm?.farmer || !settings) return;

    const actionableHealthAlerts = (healthAlerts ?? []).filter(
      (a) =>
        a.severity === AlertSeverity.CRITICAL || a.severity === 'WARNING',
    );
    const hasDisease = (diseaseAlerts ?? []).length > 0;

    if (!actionableHealthAlerts.length && !hasDisease) return;

    const summary = this.buildHealthSummary(health, diseaseAlerts ?? [], healthAlerts ?? []);

    const notification = await this.notificationsService.create(
      farm.farmer.id,
      {
        title: `Health alert for ${farm.name}`,
        message: summary,
        type: NotificationType.HEALTH_ALERT,
      },
    );

    if (settings.notifyInApp) {
      this.notificationsService.pushToStream(farm.farmer.id, notification);
    }

    if (settings.notifyEmail) {
      await this.emailProducer.sendHealthAlert({
        email: farm.farmer.email,
        firstName: farm.farmer.firstName,
        farmName: farm.name,
        summary,
      });
    }

    if (settings.notifySms && settings.smsPhoneNumber) {
      await this.smsService.sendHealthAlert(
        settings.smsPhoneNumber,
        farm.name,
        summary,
      );
    }
  }

  private buildHealthSummary(
    health: FarmHealth,
    diseaseAlerts: NonNullable<HealthJson['disease_alerts']>,
    healthAlerts: NonNullable<HealthJson['health_alerts']>,
  ): string {
    const parts: string[] = [
      `Overall health: ${Math.round(health.overall_score)}/100.`,
    ];
    const critical = healthAlerts.filter((a) => a.severity === AlertSeverity.CRITICAL);
    const warning = healthAlerts.filter((a) => a.severity === 'WARNING');
    if (critical.length) parts.push(`${critical.length} critical alert(s).`);
    if (warning.length) parts.push(`${warning.length} warning(s).`);
    if (diseaseAlerts.length) {
      parts.push(
        `Disease detected: ${diseaseAlerts.map((d) => d.disease_name).join(', ')}.`,
      );
    }
    return parts.join(' ');
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

  private buildIotDeviceTool(): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: 'trigger_iot_device',
        description:
          'Trigger a command on a registered IoT device. Use this to act on analysis findings — e.g. start irrigation when soil moisture is critically low, capture a field image when disease probability is high. Only trigger devices listed as active in the context.',
        parameters: {
          type: 'object',
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
