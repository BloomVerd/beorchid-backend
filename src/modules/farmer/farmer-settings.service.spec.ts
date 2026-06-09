import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FarmerSettingsService } from './farmer-settings.service';
import { FarmerSettings } from './entities/farmer-settings.entity';

const makeSettings = (overrides: Partial<FarmerSettings> = {}): FarmerSettings =>
  ({
    id: 'settings-1',
    farmDataLookbackSeconds: 3600,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalSeconds: 3600,
    predictionWeeklyLimit: 3,
    notifyInApp: true,
    notifyEmail: false,
    notifySms: false,
    smsPhoneNumber: null,
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
      expect(result.farmDataLookbackSeconds).toBe(3600);
      expect(result.farmDataCacheTtlSeconds).toBe(3600);
      expect(result.healthReportIntervalSeconds).toBe(3600);
      expect(result.predictionWeeklyLimit).toBe(3);
    });
  });

  describe('update', () => {
    it('merges input fields into existing settings and saves', async () => {
      const existing = makeSettings();
      const updated = makeSettings({ farmDataLookbackSeconds: 4, farmDataCacheTtlSeconds: 7200 });
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.create.mockReturnValue(existing);
      settingsRepo.save.mockResolvedValue(updated);

      const result = await service.update('farmer-1', {
        farmDataLookbackSeconds: 4,
        farmDataCacheTtlSeconds: 7200,
      });

      expect(settingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          farmDataLookbackSeconds: 4,
          farmDataCacheTtlSeconds: 7200,
        }),
      );
      expect(result.farmDataLookbackSeconds).toBe(4);
      expect(result.farmDataCacheTtlSeconds).toBe(7200);
    });

    it('preserves unchanged fields when partially updating', async () => {
      const existing = makeSettings({ predictionWeeklyLimit: 5 });
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.create.mockReturnValue(existing);
      settingsRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.update('farmer-1', {
        farmDataLookbackSeconds: 2,
      });

      expect(result.predictionWeeklyLimit).toBe(5);
      expect(result.farmDataLookbackSeconds).toBe(2);
    });

    it('ignores null fields so existing values are not overwritten', async () => {
      const existing = makeSettings({ farmDataLookbackSeconds: 2, farmDataCacheTtlSeconds: 7200 });
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.create.mockReturnValue(existing);
      settingsRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.update('farmer-1', {
        farmDataLookbackSeconds: null as any,
        farmDataCacheTtlSeconds: null as any,
        healthReportIntervalSeconds: null as any,
        predictionWeeklyLimit: null as any,
      });

      expect(result.farmDataLookbackSeconds).toBe(2);
      expect(result.farmDataCacheTtlSeconds).toBe(7200);
    });

    it('updates notification channel flags and phone number', async () => {
      const existing = makeSettings();
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.create.mockReturnValue(existing);
      settingsRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.update('farmer-1', {
        notifyEmail: true,
        notifySms: true,
        smsPhoneNumber: '+233200000000',
      });

      expect(result.notifyEmail).toBe(true);
      expect(result.notifySms).toBe(true);
      expect(result.smsPhoneNumber).toBe('+233200000000');
    });

    it('preserves notifyInApp default when updating only other fields', async () => {
      const existing = makeSettings({ notifyInApp: true });
      settingsRepo.findOne.mockResolvedValue(existing);
      settingsRepo.create.mockReturnValue(existing);
      settingsRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.update('farmer-1', { notifyEmail: true });

      expect(result.notifyInApp).toBe(true);
    });
  });
});
