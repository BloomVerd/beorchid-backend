import { Test, TestingModule } from '@nestjs/testing';
import { FarmDataService } from './farm-data.service';
import { FarmDataProducer } from './farm-data.producer';
import { ConfigService } from '@nestjs/config';
import { FarmDataStatus } from './types/farm-data.types';

const makeRedis = () => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  disconnect: jest.fn(),
});

describe('FarmDataService', () => {
  let service: FarmDataService;
  let redis: ReturnType<typeof makeRedis>;
  let producer: { enqueue: jest.Mock };

  beforeEach(async () => {
    producer = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmDataService,
        { provide: FarmDataProducer, useValue: producer },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('redis://localhost:6379') } },
      ],
    }).compile();

    service = module.get<FarmDataService>(FarmDataService);
    redis = makeRedis();
    (service as any).redis = redis;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getFarmData', () => {
    it('returns READY with parsed data when cache hit', async () => {
      const cached = {
        generated_at: '2026-06-03T10:00:00.000Z',
        sensors: { readings: [], summary: 'Soil is dry' },
        irrigation: { recommendation: 'Irrigate now', badge_text: '25mm needed' },
        yield: { tons_per_ha: 4.2, change_percent: 8.3, trend: 'up', season: '2026 Long Rains' },
      };
      redis.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.getFarmData('farm-1');

      expect(result.status).toBe(FarmDataStatus.READY);
      expect(result.generated_at).toBe(cached.generated_at);
      expect(result.sensors).toEqual(cached.sensors);
      expect(result.yield).toEqual(cached.yield);
      expect(redis.get).toHaveBeenCalledWith('farm_data:farm-1');
      expect(producer.enqueue).not.toHaveBeenCalled();
    });

    it('returns PENDING without enqueueing when pending flag is set', async () => {
      redis.get
        .mockResolvedValueOnce(null)   // farm_data key miss
        .mockResolvedValueOnce('1');   // pending flag hit

      const result = await service.getFarmData('farm-1');

      expect(result.status).toBe(FarmDataStatus.PENDING);
      expect(result.generated_at).toBeUndefined();
      expect(producer.enqueue).not.toHaveBeenCalled();
    });

    it('sets pending flag, enqueues job, and returns PENDING when nothing cached', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.getFarmData('farm-1');

      expect(result.status).toBe(FarmDataStatus.PENDING);
      expect(redis.set).toHaveBeenCalledWith('farm_data_pending:farm-1', '1', 'EX', 300);
      expect(producer.enqueue).toHaveBeenCalledWith('farm-1');
    });

    it('checks cache key before pending key', async () => {
      redis.get.mockResolvedValue(null);

      await service.getFarmData('farm-42');

      expect(redis.get).toHaveBeenNthCalledWith(1, 'farm_data:farm-42');
      expect(redis.get).toHaveBeenNthCalledWith(2, 'farm_data_pending:farm-42');
    });
  });

  describe('cacheResult', () => {
    it('stores result with 1hr TTL and deletes pending flag', async () => {
      const data = {
        generated_at: '2026-06-03T10:00:00.000Z',
        sensors: { readings: [], summary: 'OK' },
      };

      await service.cacheResult('farm-1', data);

      expect(redis.set).toHaveBeenCalledWith(
        'farm_data:farm-1',
        JSON.stringify(data),
        'EX',
        3600,
      );
      expect(redis.del).toHaveBeenCalledWith('farm_data_pending:farm-1');
    });
  });

  describe('clearPending', () => {
    it('deletes the pending flag key', async () => {
      await service.clearPending('farm-1');

      expect(redis.del).toHaveBeenCalledWith('farm_data_pending:farm-1');
    });
  });
});
