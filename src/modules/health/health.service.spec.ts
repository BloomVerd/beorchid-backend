import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { HealthService } from './health.service';
import { FarmHealth } from './entities/farm-health.entity';
import { AlertSeverity } from './entities/health.enums';
import { HealthAlert } from './entities/health-alert.entity';

const makeFarm = (overrides = {}) => ({
  id: 'farm-id-1',
  name: 'Test Farm',
  crop_type: 'MAIZE',
  farm_size: 5.0,
  ...overrides,
});

const makeFarmHealth = (overrides: Partial<FarmHealth> = {}): FarmHealth =>
  ({
    id: 'fh-id-1',
    overall_score: 85,
    soil_health: 80,
    crop_health: 90,
    weather_stress: 10,
    disease_risk: 5,
    computed_at: new Date(),
    health_alerts: [],
    farm: makeFarm() as any,
    ...overrides,
  }) as FarmHealth;

const makeAlert = (severity: AlertSeverity, overrides: Partial<HealthAlert> = {}): HealthAlert =>
  ({
    id: `alert-${severity}`,
    severity,
    title: `${severity} alert`,
    description: 'test',
    action: 'test action',
    estimated_impact: '10%',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as HealthAlert;

const makeQb = () => {
  const qb: any = {};
  const chainMethods = [
    'select', 'addSelect', 'innerJoin', 'innerJoinAndSelect',
    'leftJoinAndSelect', 'andWhere', 'groupBy', 'orderBy',
    'offset', 'limit', 'from',
  ];
  for (const m of chainMethods) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  // where may receive a callback for correlated subqueries
  qb.where = jest.fn().mockImplementation((...args) => {
    if (typeof args[0] === 'function') args[0](qb);
    return qb;
  });
  qb.subQuery = jest.fn().mockReturnValue(qb);
  qb.getQuery = jest.fn().mockReturnValue('SUBQUERY_SQL');
  qb.getRawOne = jest.fn();
  qb.getRawMany = jest.fn();
  qb.getMany = jest.fn();
  return qb;
};

describe('HealthService', () => {
  let service: HealthService;
  let farmHealthRepo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    farmHealthRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getRepositoryToken(FarmHealth), useValue: farmHealthRepo },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listFarmsHealth', () => {
    const setupQbs = (
      countValue: number,
      farmIdRows: { farmId: string }[],
      records: FarmHealth[],
    ) => {
      const countQb = makeQb();
      countQb.getRawOne.mockResolvedValue({ count: String(countValue) });

      const farmIdsQb = makeQb();
      farmIdsQb.getRawMany.mockResolvedValue(farmIdRows);

      const recordsQb = makeQb();
      recordsQb.getMany.mockResolvedValue(records);

      farmHealthRepo.createQueryBuilder
        .mockReturnValueOnce(countQb)
        .mockReturnValueOnce(farmIdsQb)
        .mockReturnValue(recordsQb);
    };

    it('returns paginated farm health summaries', async () => {
      const fh = makeFarmHealth({ health_alerts: [] });
      setupQbs(1, [{ farmId: 'farm-id-1' }], [fh]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].farmId).toBe(fh.farm.id);
      expect(result.data[0].farmName).toBe(fh.farm.name);
    });

    it('returns empty data when no farms have health records', async () => {
      const countQb = makeQb();
      countQb.getRawOne.mockResolvedValue({ count: '0' });
      const farmIdsQb = makeQb();
      farmIdsQb.getRawMany.mockResolvedValue([]);
      farmHealthRepo.createQueryBuilder
        .mockReturnValueOnce(countQb)
        .mockReturnValueOnce(farmIdsQb);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.lastPage).toBe(1);
    });

    it('sets topAlert to undefined when there are no alerts', async () => {
      const fh = makeFarmHealth({ health_alerts: [] });
      setupQbs(1, [{ farmId: 'farm-id-1' }], [fh]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.data[0].topAlert).toBeUndefined();
    });

    it('picks CRITICAL over WARNING and INFO as topAlert', async () => {
      const alerts = [
        makeAlert(AlertSeverity.INFO),
        makeAlert(AlertSeverity.CRITICAL),
        makeAlert(AlertSeverity.WARNING),
      ];
      const fh = makeFarmHealth({ health_alerts: alerts });
      setupQbs(1, [{ farmId: 'farm-id-1' }], [fh]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.data[0].topAlert?.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('picks WARNING over INFO as topAlert', async () => {
      const alerts = [makeAlert(AlertSeverity.INFO), makeAlert(AlertSeverity.WARNING)];
      const fh = makeFarmHealth({ health_alerts: alerts });
      setupQbs(1, [{ farmId: 'farm-id-1' }], [fh]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.data[0].topAlert?.severity).toBe(AlertSeverity.WARNING);
    });

    it('computes lastPage correctly for multiple pages', async () => {
      const records = Array.from({ length: 5 }, (_, i) =>
        makeFarmHealth({ id: `fh-${i}`, farm: makeFarm({ id: `farm-${i}` }) as any, health_alerts: [] }),
      );
      const farmIdRows = records.map((_, i) => ({ farmId: `farm-${i}` }));
      setupQbs(20, farmIdRows, records);

      const result = await service.listFarmsHealth('farmer-id-1', 2, 5);

      expect(result.lastPage).toBe(4);
    });

    it('returns one entry per farm', async () => {
      const farm1 = makeFarm({ id: 'farm-1', name: 'Farm 1' });
      const farm2 = makeFarm({ id: 'farm-2', name: 'Farm 2' });
      const fh1 = makeFarmHealth({ id: 'fh-1', farm: farm1 as any, health_alerts: [] });
      const fh2 = makeFarmHealth({ id: 'fh-2', farm: farm2 as any, health_alerts: [] });
      setupQbs(2, [{ farmId: 'farm-1' }, { farmId: 'farm-2' }], [fh1, fh2]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.data).toHaveLength(2);
      expect(result.data.map((d) => d.farmId)).toEqual(['farm-1', 'farm-2']);
    });

    it('preserves farm order from the farm-ID query (newest computed_at first)', async () => {
      const farm1 = makeFarm({ id: 'farm-1' });
      const farm2 = makeFarm({ id: 'farm-2' });
      const fh1 = makeFarmHealth({ id: 'fh-1', farm: farm1 as any, computed_at: new Date('2024-01-01'), health_alerts: [] });
      const fh2 = makeFarmHealth({ id: 'fh-2', farm: farm2 as any, computed_at: new Date('2024-06-01'), health_alerts: [] });
      // farm-2 is newer so comes first in the farmIds list
      setupQbs(2, [{ farmId: 'farm-2' }, { farmId: 'farm-1' }], [fh1, fh2]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.data[0].farmId).toBe('farm-2');
      expect(result.data[1].farmId).toBe('farm-1');
    });
  });

  describe('getFarmHealth', () => {
    it('returns the farm health record when found', async () => {
      const fh = makeFarmHealth();
      farmHealthRepo.findOne.mockResolvedValue(fh);

      const result = await service.getFarmHealth('farmer-id-1', 'farm-id-1');

      expect(result).toBe(fh);
    });

    it('throws NotFoundException when no health data is found', async () => {
      farmHealthRepo.findOne.mockResolvedValue(null);

      await expect(service.getFarmHealth('farmer-id-1', 'farm-id-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('includes farmId in the NotFoundException message', async () => {
      farmHealthRepo.findOne.mockResolvedValue(null);

      await expect(service.getFarmHealth('farmer-id-1', 'farm-xyz')).rejects.toThrow(
        /farm-xyz/,
      );
    });
  });
});
