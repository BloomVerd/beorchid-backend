import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HealthScheduler } from './health.scheduler';
import { HealthProducer } from './health.producer';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from './entities/farm-health.entity';
import { FarmerSettings } from '../farmer/entities/farmer-settings.entity';

const makeFarm = (id: string, farmerId = 'farmer-1'): Farm =>
  ({ id, farmer: { id: farmerId } }) as any as Farm;

const makeSettings = (healthReportIntervalSeconds = 3600): FarmerSettings =>
  ({ healthReportIntervalSeconds }) as FarmerSettings;

const makeQBChain = (rawRows: Array<{ farmId: string; lastComputedAt: string | null }>) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue(rawRows),
});

describe('HealthScheduler', () => {
  let scheduler: HealthScheduler;
  let farmRepo: { find: jest.Mock };
  let farmHealthRepo: { createQueryBuilder: jest.Mock };
  let farmerSettingsService: { getOrCreate: jest.Mock };
  let healthProducer: { enqueueBatch: jest.Mock };

  beforeEach(async () => {
    farmRepo = { find: jest.fn() };
    farmHealthRepo = { createQueryBuilder: jest.fn() };
    farmerSettingsService = { getOrCreate: jest.fn().mockResolvedValue(makeSettings(1)) };
    healthProducer = { enqueueBatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthScheduler,
        { provide: getRepositoryToken(Farm), useValue: farmRepo },
        { provide: getRepositoryToken(FarmHealth), useValue: farmHealthRepo },
        { provide: FarmerSettingsService, useValue: farmerSettingsService },
        { provide: HealthProducer, useValue: healthProducer },
      ],
    }).compile();

    scheduler = module.get<HealthScheduler>(HealthScheduler);
  });

  afterEach(() => jest.clearAllMocks());

  it('does nothing when there are no active farms', async () => {
    farmRepo.find.mockResolvedValue([]);

    await scheduler.schedulePendingHealthComputes();

    expect(healthProducer.enqueueBatch).not.toHaveBeenCalled();
  });

  it('enqueues a farm with no prior health record', async () => {
    farmRepo.find.mockResolvedValue([makeFarm('farm-1')]);
    farmHealthRepo.createQueryBuilder.mockReturnValue(makeQBChain([]));

    await scheduler.schedulePendingHealthComputes();

    expect(healthProducer.enqueueBatch).toHaveBeenCalledTimes(1);
    expect(healthProducer.enqueueBatch).toHaveBeenCalledWith(['farm-1']);
  });

  it('enqueues a farm whose last health is older than the interval', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    farmRepo.find.mockResolvedValue([makeFarm('farm-1')]);
    farmHealthRepo.createQueryBuilder.mockReturnValue(
      makeQBChain([{ farmId: 'farm-1', lastComputedAt: twoHoursAgo }]),
    );
    farmerSettingsService.getOrCreate.mockResolvedValue(makeSettings(3600)); // 1h interval

    await scheduler.schedulePendingHealthComputes();

    expect(healthProducer.enqueueBatch).toHaveBeenCalledWith(['farm-1']);
  });

  it('skips a farm whose last health is within the interval', async () => {
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    farmRepo.find.mockResolvedValue([makeFarm('farm-1')]);
    farmHealthRepo.createQueryBuilder.mockReturnValue(
      makeQBChain([{ farmId: 'farm-1', lastComputedAt: thirtySecondsAgo }]),
    );
    farmerSettingsService.getOrCreate.mockResolvedValue(makeSettings(3600)); // 1h interval

    await scheduler.schedulePendingHealthComputes();

    expect(healthProducer.enqueueBatch).not.toHaveBeenCalled();
  });

  it('batches 110 stale farms into 3 separate queue jobs', async () => {
    const farms = Array.from({ length: 110 }, (_, i) => makeFarm(`farm-${i}`));
    farmRepo.find.mockResolvedValue(farms);
    farmHealthRepo.createQueryBuilder.mockReturnValue(makeQBChain([]));

    await scheduler.schedulePendingHealthComputes();

    expect(healthProducer.enqueueBatch).toHaveBeenCalledTimes(3);
    expect(healthProducer.enqueueBatch.mock.calls[0][0]).toHaveLength(50);
    expect(healthProducer.enqueueBatch.mock.calls[1][0]).toHaveLength(50);
    expect(healthProducer.enqueueBatch.mock.calls[2][0]).toHaveLength(10);
  });

  it('does not enqueue when all farms are fresh', async () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
    const farms = [makeFarm('farm-1'), makeFarm('farm-2')];
    farmRepo.find.mockResolvedValue(farms);
    farmHealthRepo.createQueryBuilder.mockReturnValue(
      makeQBChain([
        { farmId: 'farm-1', lastComputedAt: tenSecondsAgo },
        { farmId: 'farm-2', lastComputedAt: tenSecondsAgo },
      ]),
    );
    farmerSettingsService.getOrCreate.mockResolvedValue(makeSettings(3600));

    await scheduler.schedulePendingHealthComputes();

    expect(healthProducer.enqueueBatch).not.toHaveBeenCalled();
  });
});
