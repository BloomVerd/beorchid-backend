import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HealthConsumer } from './health.consumer';
import { Farm } from '../farm/entities/farm.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { FarmHealth } from './entities/farm-health.entity';
import { CropFieldHealth } from './entities/crop-field-health.entity';
import { DiseaseAlert } from './entities/disease-alert.entity';
import { HealthAlert } from './entities/health-alert.entity';
import { SensorHistoryPoint } from './entities/sensor-history-point.entity';
import { YieldComparison } from './entities/yield-comparison.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { FarmService } from '../farm/farm.service';

const makeJob = (data: object, name = 'compute-health-batch') => ({ name, data });

const makeFarm = (): Farm =>
  ({
    id: 'farm-1',
    name: 'Test Farm',
    crop_type: 'MAIZE',
    variety: 'DK8031',
    farm_size: 10,
    size_unit: 'HECTARES',
    soil_type: 'LOAM',
    farm_type: 'FIELD',
    farmer: { id: 'farmer-1' },
  }) as any as Farm;

const makeTelemetryItem = () => ({
  farm_id: 'farm-1',
  timestamp: new Date().toISOString(),
  device_id: 'device-1',
  humidity: 69,
  ph: 6.6,
  soil_moisture: 70.5,
  temperature: 29.3,
});

const makeClaudeHealthResponse = (overrides: object = {}) => ({
  stop_reason: 'end_turn',
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        overall_score: 78,
        soil_health: 72,
        crop_health: 80,
        weather_stress: 25,
        disease_risk: 15,
        crop_field_health: [
          {
            field_name: 'Field A',
            crop_type: 'MAIZE',
            health_percent: 80,
            ndvi: 0.72,
            disease_probability: 0.1,
            disease_type: null,
            growth_stage: 'VEGETATIVE',
            expected_harvest: 'August 2026',
          },
        ],
        disease_alerts: [],
        health_alerts: [
          {
            severity: 'INFO',
            title: 'Soil moisture optimal',
            description: 'Moisture levels are within range.',
            action: 'No action needed.',
            estimated_impact: 'None',
          },
        ],
        sensor_history: [
          { date: '2026-06-03', moisture: 70.5, temperature: 29.3, nitrogen: 1.2, phosphorus: 0.8, potassium: 1.5 },
        ],
        yield_comparisons: [
          { field_name: 'Field A', current_yield: 4.2, last_season_yield: 3.9, confidence_min: 3.8, confidence_max: 4.6, revenue: 1260 },
        ],
        ...overrides,
      }),
    },
  ],
});

describe('HealthConsumer', () => {
  let consumer: HealthConsumer;
  let farmRepo: { findOne: jest.Mock };
  let iotDeviceRepo: { find: jest.Mock };
  let farmHealthRepo: { create: jest.Mock; save: jest.Mock };
  let cropFieldHealthRepo: { create: jest.Mock; save: jest.Mock };
  let diseaseAlertRepo: { create: jest.Mock; save: jest.Mock };
  let healthAlertRepo: { create: jest.Mock; save: jest.Mock };
  let sensorRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let yieldRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let predictionRepo: { find: jest.Mock };
  let farmerSettingsService: { getOrCreate: jest.Mock };
  let farmService: { triggerIotDevice: jest.Mock };
  let anthropicCreate: jest.Mock;
  let dynamodbSend: jest.Mock;

  beforeEach(async () => {
    const savedHealth = { id: 'health-saved-1' };

    farmRepo = { findOne: jest.fn().mockResolvedValue(makeFarm()) };
    iotDeviceRepo = { find: jest.fn().mockResolvedValue([]) };
    farmHealthRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue(savedHealth),
    };
    cropFieldHealthRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue([]),
    };
    diseaseAlertRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue([]),
    };
    healthAlertRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue([]),
    };
    sensorRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue([]),
    };
    yieldRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue([]),
    };
    predictionRepo = { find: jest.fn().mockResolvedValue([]) };
    farmerSettingsService = {
      getOrCreate: jest.fn().mockResolvedValue({ farmDataLookbackSeconds: 3600 }),
    };
    farmService = {
      triggerIotDevice: jest.fn().mockResolvedValue({ id: 'tool-call-1', status: 'PENDING' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthConsumer,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-api-key') } },
        { provide: getRepositoryToken(Farm), useValue: farmRepo },
        { provide: getRepositoryToken(IotDevice), useValue: iotDeviceRepo },
        { provide: getRepositoryToken(FarmHealth), useValue: farmHealthRepo },
        { provide: getRepositoryToken(CropFieldHealth), useValue: cropFieldHealthRepo },
        { provide: getRepositoryToken(DiseaseAlert), useValue: diseaseAlertRepo },
        { provide: getRepositoryToken(HealthAlert), useValue: healthAlertRepo },
        { provide: getRepositoryToken(SensorHistoryPoint), useValue: sensorRepo },
        { provide: getRepositoryToken(YieldComparison), useValue: yieldRepo },
        { provide: getRepositoryToken(Prediction), useValue: predictionRepo },
        { provide: FarmerSettingsService, useValue: farmerSettingsService },
        { provide: FarmService, useValue: farmService },
      ],
    }).compile();

    consumer = module.get<HealthConsumer>(HealthConsumer);

    anthropicCreate = jest.fn().mockResolvedValue(makeClaudeHealthResponse());
    dynamodbSend = jest.fn().mockResolvedValue({ Items: [makeTelemetryItem()] });
    (consumer as any).anthropic = { messages: { create: anthropicCreate } };
    (consumer as any).dynamodb = { send: dynamodbSend };
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('ignores jobs with an unrecognised name', async () => {
      await consumer.process(makeJob({ farmIds: ['farm-1'] }, 'other-job') as any);

      expect(farmRepo.findOne).not.toHaveBeenCalled();
      expect(anthropicCreate).not.toHaveBeenCalled();
    });

    it('happy path: saves FarmHealth and all nested entities', async () => {
      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      expect(farmHealthRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          overall_score: 78,
          soil_health: 72,
          crop_health: 80,
          weather_stress: 25,
          disease_risk: 15,
          computed_at: expect.any(Date),
        }),
      );
      expect(cropFieldHealthRepo.save).toHaveBeenCalled();
      expect(healthAlertRepo.save).toHaveBeenCalled();
      expect(sensorRepo.save).toHaveBeenCalled();
      expect(yieldRepo.save).toHaveBeenCalled();
    });

    it('skips nested saves when Claude returns empty arrays', async () => {
      anthropicCreate.mockResolvedValue(
        makeClaudeHealthResponse({
          crop_field_health: [],
          disease_alerts: [],
          health_alerts: [],
          sensor_history: [],
          yield_comparisons: [],
        }),
      );

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      expect(farmHealthRepo.save).toHaveBeenCalled();
      expect(cropFieldHealthRepo.save).not.toHaveBeenCalled();
      expect(diseaseAlertRepo.save).not.toHaveBeenCalled();
      expect(healthAlertRepo.save).not.toHaveBeenCalled();
      expect(sensorRepo.save).not.toHaveBeenCalled();
      expect(yieldRepo.save).not.toHaveBeenCalled();
    });

    it('swallows per-farm error so remaining farms in batch are processed', async () => {
      farmRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue(makeFarm());
      anthropicCreate
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValue(makeClaudeHealthResponse());

      await expect(
        consumer.process(makeJob({ farmIds: ['farm-bad', 'farm-good'] }) as any),
      ).resolves.not.toThrow();
    });

    it('includes DynamoDB telemetry in the Claude prompt context', async () => {
      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      const callArgs = anthropicCreate.mock.calls[0][0];
      const userMessage: string = callArgs.messages[0].content;
      expect(userMessage).toContain('soil_moisture=70.5%');
      expect(userMessage).toContain('humidity=69%');
    });

    it('saves Claude-generated sensor history snapshots to PostgreSQL', async () => {
      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      expect(sensorRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            date: '2026-06-03',
            moisture: 70.5,
            temperature: 29.3,
          }),
        ]),
      );
    });

    it('saves nested entities with reference to the saved FarmHealth id', async () => {
      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      const savedCropFields = cropFieldHealthRepo.save.mock.calls[0][0];
      expect(savedCropFields[0].farmHealth).toEqual({ id: 'health-saved-1' });
    });

    it('executes IoT tool calls and feeds results back before producing final JSON', async () => {
      const toolUseResponse = {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu-1',
            name: 'trigger_iot_device',
            input: { device_id: 'device-uuid-1', command_type: 'IRRIGATE', parameters: { duration_minutes: 30 } },
          },
        ],
      };
      anthropicCreate
        .mockResolvedValueOnce(toolUseResponse)
        .mockResolvedValue(makeClaudeHealthResponse());

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      expect(farmService.triggerIotDevice).toHaveBeenCalledWith(
        'farmer-1',
        'farm-1',
        'device-uuid-1',
        { command_type: 'IRRIGATE', parameters: { duration_minutes: 30 } },
      );
      expect(anthropicCreate).toHaveBeenCalledTimes(2);
      const secondCall = anthropicCreate.mock.calls[1][0];
      const toolResultMsg = secondCall.messages.find(
        (m: any) => m.role === 'user' && Array.isArray(m.content),
      );
      expect(toolResultMsg.content[0]).toMatchObject({
        type: 'tool_result',
        tool_use_id: 'tu-1',
        content: expect.stringContaining('tool-call-1'),
      });
      expect(farmHealthRepo.save).toHaveBeenCalled();
    });
  });
});
