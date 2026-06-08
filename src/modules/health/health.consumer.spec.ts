jest.mock('archiver', () => jest.fn());

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HealthConsumer } from './health.consumer';
import { Farm } from '../farm/entities/farm.entity';
import { DeviceStatus, IotDevice } from '../farm/entities/iot-device.entity';
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

const makeLlmHealthResponse = (overrides: object = {}) => ({
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: JSON.stringify({
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
    },
  ],
});

describe('HealthConsumer', () => {
  let consumer: HealthConsumer;
  let farmRepo: { findOne: jest.Mock };
  let iotDeviceRepo: { find: jest.Mock; save: jest.Mock };
  let farmHealthRepo: { create: jest.Mock; save: jest.Mock };
  let cropFieldHealthRepo: { create: jest.Mock; save: jest.Mock };
  let diseaseAlertRepo: { create: jest.Mock; save: jest.Mock };
  let healthAlertRepo: { create: jest.Mock; save: jest.Mock };
  let sensorRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let yieldRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let predictionRepo: { find: jest.Mock };
  let farmerSettingsService: { getOrCreate: jest.Mock };
  let farmService: { triggerIotDevice: jest.Mock };
  let llmCreate: jest.Mock;
  let dynamodbSend: jest.Mock;

  beforeEach(async () => {
    const savedHealth = { id: 'health-saved-1' };

    farmRepo = { findOne: jest.fn().mockResolvedValue(makeFarm()) };
    iotDeviceRepo = { find: jest.fn().mockResolvedValue([]), save: jest.fn().mockResolvedValue([]) };
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

    llmCreate = jest.fn().mockResolvedValue(makeLlmHealthResponse());
    dynamodbSend = jest.fn().mockResolvedValue({ Items: [makeTelemetryItem()] });
    (consumer as any).llm = { chat: { completions: { create: llmCreate } } };
    (consumer as any).dynamodb = { send: dynamodbSend };
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('ignores jobs with an unrecognised name', async () => {
      await consumer.process(makeJob({ farmIds: ['farm-1'] }, 'other-job') as any);

      expect(farmRepo.findOne).not.toHaveBeenCalled();
      expect(llmCreate).not.toHaveBeenCalled();
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
      llmCreate.mockResolvedValue(
        makeLlmHealthResponse({
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
      llmCreate
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValue(makeLlmHealthResponse());

      await expect(
        consumer.process(makeJob({ farmIds: ['farm-bad', 'farm-good'] }) as any),
      ).resolves.not.toThrow();
    });

    it('includes DynamoDB telemetry in the Claude prompt context', async () => {
      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      const callArgs = llmCreate.mock.calls[0][0];
      const userMessage: string = callArgs.messages[1].content;
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
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'tu-1',
                  type: 'function',
                  function: {
                    name: 'trigger_iot_device',
                    arguments: JSON.stringify({
                      device_id: 'device-uuid-1',
                      command_type: 'IRRIGATE',
                      parameters: { duration_minutes: 30 },
                    }),
                  },
                },
              ],
            },
          },
        ],
      };
      llmCreate
        .mockResolvedValueOnce(toolUseResponse)
        .mockResolvedValue(makeLlmHealthResponse());

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      expect(farmService.triggerIotDevice).toHaveBeenCalledWith(
        'farmer-1',
        'farm-1',
        'device-uuid-1',
        { command_type: 'IRRIGATE', parameters: { duration_minutes: 30 } },
      );
      expect(llmCreate).toHaveBeenCalledTimes(2);
      const secondCall = llmCreate.mock.calls[1][0];
      const toolResultMsg = secondCall.messages.find(
        (m: any) => m.role === 'tool' && m.tool_call_id === 'tu-1',
      );
      expect(toolResultMsg).toMatchObject({
        role: 'tool',
        tool_call_id: 'tu-1',
        content: expect.stringContaining('tool-call-1'),
      });
      expect(farmHealthRepo.save).toHaveBeenCalled();
    });

    it('marks a device ONLINE when its device_id appears in telemetry', async () => {
      const device = { id: 'dev-1', device_id: 'device-1', is_active: true };
      iotDeviceRepo.find.mockResolvedValue([device]);
      dynamodbSend.mockResolvedValue({
        Items: [{ farm_id: 'farm-1', timestamp: new Date().toISOString(), device_id: 'device-1' }],
      });

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      const saved: any[] = iotDeviceRepo.save.mock.calls[0][0];
      expect(saved.find((d) => d.id === 'dev-1').status).toBe(DeviceStatus.ONLINE);
    });

    it('marks a device OFFLINE when active but its device_id is absent from telemetry', async () => {
      const device = { id: 'dev-1', device_id: 'device-99', is_active: true };
      iotDeviceRepo.find.mockResolvedValue([device]);
      dynamodbSend.mockResolvedValue({
        Items: [{ farm_id: 'farm-1', timestamp: new Date().toISOString(), device_id: 'device-other' }],
      });

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      const saved: any[] = iotDeviceRepo.save.mock.calls[0][0];
      expect(saved.find((d) => d.id === 'dev-1').status).toBe(DeviceStatus.OFFLINE);
    });

    it('marks a device INACTIVE when is_active is false regardless of telemetry', async () => {
      const device = { id: 'dev-1', device_id: 'device-1', is_active: false };
      iotDeviceRepo.find.mockResolvedValue([device]);
      dynamodbSend.mockResolvedValue({
        Items: [{ farm_id: 'farm-1', timestamp: new Date().toISOString(), device_id: 'device-1' }],
      });

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      const saved: any[] = iotDeviceRepo.save.mock.calls[0][0];
      expect(saved.find((d) => d.id === 'dev-1').status).toBe(DeviceStatus.INACTIVE);
    });

    it('skips the device status save when there are no devices for the farm', async () => {
      iotDeviceRepo.find.mockResolvedValue([]);

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      expect(iotDeviceRepo.save).not.toHaveBeenCalled();
    });

    it('assigns correct statuses across a mixed batch of devices', async () => {
      const devices = [
        { id: 'dev-online',   device_id: 'device-online',   is_active: true  },
        { id: 'dev-offline',  device_id: 'device-offline',  is_active: true  },
        { id: 'dev-inactive', device_id: 'device-inactive', is_active: false },
      ];
      iotDeviceRepo.find.mockResolvedValue(devices);
      dynamodbSend.mockResolvedValue({
        Items: [
          { farm_id: 'farm-1', timestamp: new Date().toISOString(), device_id: 'device-online' },
          { farm_id: 'farm-1', timestamp: new Date().toISOString(), device_id: 'device-inactive' },
        ],
      });

      await consumer.process(makeJob({ farmIds: ['farm-1'] }) as any);

      const saved: any[] = iotDeviceRepo.save.mock.calls[0][0];
      expect(saved.find((d) => d.id === 'dev-online').status).toBe(DeviceStatus.ONLINE);
      expect(saved.find((d) => d.id === 'dev-offline').status).toBe(DeviceStatus.OFFLINE);
      expect(saved.find((d) => d.id === 'dev-inactive').status).toBe(DeviceStatus.INACTIVE);
    });
  });
});

