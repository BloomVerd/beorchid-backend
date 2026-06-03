import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FarmDataConsumer } from './farm-data.consumer';
import { FarmDataService } from './farm-data.service';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { YieldComparison } from '../health/entities/yield-comparison.entity';
import { FarmerSettings } from '../farmer/entities/farmer-settings.entity';

const makeJob = (data: object, name = 'generate-farm-data') => ({ name, data });

const makeFarm = (): Farm =>
  ({
    id: 'farm-1',
    name: 'Test Farm',
    crop_type: 'MAIZE',
    variety: 'DK8031',
    farm_size: 10,
    size_unit: 'HECTARES',
    soil_type: 'LOAM',
    farmer: { id: 'farmer-1' },
  }) as any as Farm;

const makeHealth = (): FarmHealth =>
  ({
    id: 'health-1',
    overall_score: 78,
    soil_health: 72,
    crop_health: 80,
    weather_stress: 30,
    disease_risk: 20,
    computed_at: new Date(),
    health_alerts: [],
    disease_alerts: [],
  }) as any as FarmHealth;

const makeTelemetryItem = () => ({
  farm_id: 'farm-1',
  timestamp: new Date().toISOString(),
  device_id: 'device-1',
  humidity: 69,
  ph: 6.6,
  soil_moisture: 70.5,
  temperature: 29.3,
});

const makeYield = (): YieldComparison =>
  ({
    id: 'yield-1',
    field_name: 'North Field',
    current_yield: 4.2,
    last_season_yield: 3.9,
    confidence_min: 3.8,
    confidence_max: 4.6,
    createdAt: new Date(),
  }) as YieldComparison;

const makeSettings = (overrides: Partial<FarmerSettings> = {}): FarmerSettings =>
  ({
    farmDataLookbackHours: 1,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalHours: 1,
    predictionWeeklyLimit: 3,
    ...overrides,
  }) as FarmerSettings;

const makeClaudeResponse = (json: object) => ({
  content: [{ type: 'text', text: JSON.stringify(json) }],
});

describe('FarmDataConsumer', () => {
  let consumer: FarmDataConsumer;
  let farmRepo: { findOne: jest.Mock };
  let healthRepo: { findOne: jest.Mock };
  let iotRepo: { find: jest.Mock };
  let yieldRepo: { find: jest.Mock };
  let farmDataService: { cacheResult: jest.Mock; clearPending: jest.Mock };
  let farmerSettingsService: { getOrCreate: jest.Mock };
  let anthropicCreate: jest.Mock;
  let dynamodbSend: jest.Mock;

  beforeEach(async () => {
    farmRepo = { findOne: jest.fn().mockResolvedValue(makeFarm()) };
    healthRepo = { findOne: jest.fn().mockResolvedValue(makeHealth()) };
    iotRepo = { find: jest.fn().mockResolvedValue([]) };
    yieldRepo = { find: jest.fn().mockResolvedValue([makeYield()]) };
    farmDataService = {
      cacheResult: jest.fn().mockResolvedValue(undefined),
      clearPending: jest.fn().mockResolvedValue(undefined),
    };
    farmerSettingsService = {
      getOrCreate: jest.fn().mockResolvedValue(makeSettings()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmDataConsumer,
        { provide: FarmDataService, useValue: farmDataService },
        { provide: FarmerSettingsService, useValue: farmerSettingsService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-api-key') } },
        { provide: getRepositoryToken(Farm), useValue: farmRepo },
        { provide: getRepositoryToken(FarmHealth), useValue: healthRepo },
        { provide: getRepositoryToken(IotDevice), useValue: iotRepo },
        { provide: getRepositoryToken(YieldComparison), useValue: yieldRepo },
      ],
    }).compile();

    consumer = module.get<FarmDataConsumer>(FarmDataConsumer);

    anthropicCreate = jest.fn();
    dynamodbSend = jest.fn().mockResolvedValue({ Items: [makeTelemetryItem()] });
    (consumer as any).anthropic = { messages: { create: anthropicCreate } };
    (consumer as any).dynamodb = { send: dynamodbSend };
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('ignores jobs with an unrecognised name', async () => {
      await consumer.process(makeJob({ farmId: 'farm-1' }, 'other-job') as any);

      expect(farmRepo.findOne).not.toHaveBeenCalled();
      expect(anthropicCreate).not.toHaveBeenCalled();
    });

    it('runs the full happy path and caches all three sections', async () => {
      const claudeJson = {
        sensors: { readings: [{ soil_moisture: 70.5, temperature: 29.3 }], summary: 'Soil moisture is adequate' },
        irrigation: { recommendation: 'Irrigate 25mm within 12 hours', amount_mm: 25, urgency_hours: 12, next_rainfall: 'Tomorrow', badge_text: '25mm needed' },
        yield: { tons_per_ha: 4.2, change_percent: 7.7, trend: 'up', season: '2026 Long Rains' },
      };
      anthropicCreate.mockResolvedValue(makeClaudeResponse(claudeJson));

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(farmDataService.cacheResult).toHaveBeenCalledWith(
        'farm-1',
        expect.objectContaining({
          generated_at: expect.any(String),
          sensors: expect.objectContaining({ summary: 'Soil moisture is adequate' }),
          irrigation: expect.objectContaining({ amount_mm: 25, badge_text: '25mm needed' }),
          yield: expect.objectContaining({ tons_per_ha: 4.2, trend: 'up' }),
        }),
        3600,
      );
      expect(farmDataService.clearPending).not.toHaveBeenCalled();
    });

    it('passes farmer settings cache TTL to cacheResult', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(
        makeSettings({ farmDataCacheTtlSeconds: 7200 }),
      );
      anthropicCreate.mockResolvedValue(
        makeClaudeResponse({ yield: { tons_per_ha: 4.0, change_percent: 5.0, trend: 'up', season: '2026' } }),
      );

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(farmDataService.cacheResult).toHaveBeenCalledWith(
        'farm-1',
        expect.any(Object),
        7200,
      );
    });

    it('uses settings lookback hours for DynamoDB query', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(
        makeSettings({ farmDataLookbackHours: 3 }),
      );
      anthropicCreate.mockResolvedValue(makeClaudeResponse({}));

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      const queryArg = dynamodbSend.mock.calls[0][0].input;
      const since = new Date(queryArg.ExpressionAttributeValues[':since']);
      const expectedSince = new Date(Date.now() - 3 * 3_600_000);
      expect(Math.abs(since.getTime() - expectedSince.getTime())).toBeLessThan(5000);
    });

    it('omits sensor section when Claude does not return sensors key', async () => {
      dynamodbSend.mockResolvedValue({ Items: [] });
      anthropicCreate.mockResolvedValue(
        makeClaudeResponse({
          irrigation: { recommendation: 'Check irrigation', badge_text: 'OK' },
          yield: { tons_per_ha: 3.5, change_percent: -2.0, trend: 'down', season: '2026 Short Rains' },
        }),
      );

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      const cached = farmDataService.cacheResult.mock.calls[0][1];
      expect(cached.sensors).toBeUndefined();
      expect(cached.irrigation).toBeDefined();
      expect(cached.yield).toBeDefined();
    });

    it('only caches yield section when that is the only section returned', async () => {
      dynamodbSend.mockResolvedValue({ Items: [] });
      anthropicCreate.mockResolvedValue(
        makeClaudeResponse({
          yield: { tons_per_ha: 5.0, change_percent: 15.0, trend: 'up', season: '2026 Long Rains' },
        }),
      );

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      const cached = farmDataService.cacheResult.mock.calls[0][1];
      expect(cached.sensors).toBeUndefined();
      expect(cached.irrigation).toBeUndefined();
      expect(cached.yield).toEqual(expect.objectContaining({ tons_per_ha: 5.0 }));
    });

    it('clears pending flag and does not cache when Anthropic throws', async () => {
      anthropicCreate.mockRejectedValue(new Error('API rate limit'));

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(farmDataService.clearPending).toHaveBeenCalledWith('farm-1');
      expect(farmDataService.cacheResult).not.toHaveBeenCalled();
    });

    it('clears pending flag when a DB query throws', async () => {
      farmRepo.findOne.mockRejectedValue(new Error('DB connection lost'));

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(farmDataService.clearPending).toHaveBeenCalledWith('farm-1');
      expect(farmDataService.cacheResult).not.toHaveBeenCalled();
    });

    it('clears pending flag when Claude returns invalid JSON', async () => {
      anthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Sorry, I cannot process this request.' }],
      });

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(farmDataService.clearPending).toHaveBeenCalledWith('farm-1');
      expect(farmDataService.cacheResult).not.toHaveBeenCalled();
    });

    it('extracts JSON from markdown code fences', async () => {
      const json = { yield: { tons_per_ha: 4.0, change_percent: 5.0, trend: 'up', season: '2026 Long Rains' } };
      anthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(json)}\n\`\`\`` }],
      });

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(farmDataService.cacheResult).toHaveBeenCalled();
      const cached = farmDataService.cacheResult.mock.calls[0][1];
      expect(cached.yield?.tons_per_ha).toBe(4.0);
    });

    it('passes farm context to Claude including DynamoDB sensor readings', async () => {
      anthropicCreate.mockResolvedValue(
        makeClaudeResponse({ sensors: { readings: [], summary: 'OK' } }),
      );

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      const callArgs = anthropicCreate.mock.calls[0][0];
      const userMessage: string = callArgs.messages[0].content;
      expect(userMessage).toContain('Test Farm');
      expect(userMessage).toContain('MAIZE');
      expect(userMessage).toContain('soil_moisture=70.5%');
    });
  });
});
