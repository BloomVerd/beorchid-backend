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

describe('HealthService', () => {
  let service: HealthService;
  let farmHealthRepo: { findAndCount: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    farmHealthRepo = {
      findAndCount: jest.fn(),
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
    it('returns paginated farm health summaries', async () => {
      const fh = makeFarmHealth({ health_alerts: [] });
      farmHealthRepo.findAndCount.mockResolvedValue([[fh], 1]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].farmId).toBe(fh.farm.id);
      expect(result.data[0].farmName).toBe(fh.farm.name);
    });

    it('sets topAlert to undefined when there are no alerts', async () => {
      const fh = makeFarmHealth({ health_alerts: [] });
      farmHealthRepo.findAndCount.mockResolvedValue([[fh], 1]);

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
      farmHealthRepo.findAndCount.mockResolvedValue([[fh], 1]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.data[0].topAlert?.severity).toBe(AlertSeverity.CRITICAL);
    });

    it('picks WARNING over INFO as topAlert', async () => {
      const alerts = [makeAlert(AlertSeverity.INFO), makeAlert(AlertSeverity.WARNING)];
      const fh = makeFarmHealth({ health_alerts: alerts });
      farmHealthRepo.findAndCount.mockResolvedValue([[fh], 1]);

      const result = await service.listFarmsHealth('farmer-id-1', 1, 10);

      expect(result.data[0].topAlert?.severity).toBe(AlertSeverity.WARNING);
    });

    it('computes lastPage correctly for multiple pages', async () => {
      const records = Array.from({ length: 5 }, (_, i) =>
        makeFarmHealth({ id: `fh-${i}`, health_alerts: [] }),
      );
      farmHealthRepo.findAndCount.mockResolvedValue([records, 20]);

      const result = await service.listFarmsHealth('farmer-id-1', 2, 5);

      expect(result.lastPage).toBe(4);
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
