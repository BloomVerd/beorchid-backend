import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FarmerSettingsService } from './farmer-settings.service';
import { FarmerSettings } from './entities/farmer-settings.entity';

const makeSettings = (overrides: Partial<FarmerSettings> = {}): FarmerSettings =>
  ({
    id: 'settings-1',
    farmDataLookbackHours: 1,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalHours: 1,
    predictionWeeklyLimit: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    farmer: { id: 'farmer-1' } as any,
    ...overrides,
  }) as FarmerSettings;

describe('FarmerSettingsService', () => {
  let service: FarmerSettingsService;
  let settingsRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    settingsRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmerSettingsService,
        { provide: getRepositoryToken(FarmerSettings), useValue: settingsRepo },
      ],
    }).compile();

    service = module.get<FarmerSettingsService>(FarmerSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getOrCreate', () => {
    it('returns existing settings when found', async () => {
      const settings = makeSettings();
      settingsRepo.findOne.mockResolvedValue(settings);

      const result = await service.getOrCreate('farmer-1');

      expect(result).toBe(settings);
      expect(settingsRepo.create).not.toHaveBeenCalled();
      expect(settingsRepo.save).not.toHaveBeenCalled();
    });

    it('creates and saves new settings with defaults when none exist', async () => {
      const newSettings = makeSettings();
      settingsRepo.findOne.mockResolvedValue(null);
      settingsRepo.create.mockReturnValue(newSettings);
      settingsRepo.save.mockResolvedValue(newSettings);

      const result = await service.getOrCreate('farmer-1');

      expect(settingsRepo.create).toHaveBeenCalledWith({
        farmer: { id: 'farmer-1' },
      });
      expect(settingsRepo.save).toHaveBeenCalledWith(newSettings);
      expect(result.farmDataLookbackHours).toBe(1);
      expect(result.farmDataCacheTtlSeconds).toBe(3600);
      expect(result.healthReportIntervalHours).toBe(1);
      expect(result.predictionWeeklyLimit).toBe(3);
    });
  });

  describe('update', () => {
    it('merges input fields into existing settings and saves', async () => {
      const existing = makeSettings();
      const updated = makeSettings({ farmDataLookbackHours: 4, farmDataCacheTtlSeconds: 7200 });
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.create.mockReturnValue(existing);
      settingsRepo.save.mockResolvedValue(updated);

      const result = await service.update('farmer-1', {
        farmDataLookbackHours: 4,
        farmDataCacheTtlSeconds: 7200,
      });

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          farmDataLookbackHours: 4,
          farmDataCacheTtlSeconds: 7200,
        }),
      );
      expect(result.farmDataLookbackHours).toBe(4);
      expect(result.farmDataCacheTtlSeconds).toBe(7200);
    });

    it('preserves unchanged fields when partially updating', async () => {
      const existing = makeSettings({ predictionWeeklyLimit: 5 });
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.create.mockReturnValue(existing);
      settingsRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.update('farmer-1', {
        farmDataLookbackHours: 2,
      });

      expect(result.predictionWeeklyLimit).toBe(5);
      expect(result.farmDataLookbackHours).toBe(2);
    });
  });
});
