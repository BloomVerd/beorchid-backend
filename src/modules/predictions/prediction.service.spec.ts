import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PredictionService } from './prediction.service';
import { Prediction } from './entities/prediction.entity';
import { PredictionProducer } from './prediction.producer';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { PredictionType } from '../farm/entities/image-data.entity';

const makeFarmer = (overrides = {}) => ({
  id: 'farmer-id-1',
  email: 'farmer@example.com',
  firstName: 'John',
  ...overrides,
});

const makeFarm = (overrides: any = {}) => ({
  id: 'farm-id-1',
  name: 'Test Farm',
  farm_images: [],
  farmer: { id: 'farmer-id-1' },
  ...overrides,
});

const makeImage = (predictionTypes: PredictionType[] = [PredictionType.DISEASE_PREDICTION]) => ({
  id: `img-${Math.random()}`,
  url: 'https://cdn.example.com/img.jpg',
  lat: 5.0,
  lon: -1.0,
  prediction_types: predictionTypes,
});

const makePredictionRange = (overrides: any = {}) => ({
  id: 'range-id-1',
  week_start: new Date(),
  week_end: new Date(),
  inserted_at: new Date(),
  regeneration_count: 1,
  ...overrides,
});

describe('PredictionService', () => {
  let service: PredictionService;
  let predictionRepo: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    findAndCount: jest.Mock;
    manager: {
      transaction: jest.Mock;
      findOne: jest.Mock;
    };
  };
  let predictionProducer: { createPrediction: jest.Mock };
  let farmerSettingsService: { getOrCreate: jest.Mock };
  let mockEm: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    mockEm = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((_entity: any, data: any) => data),
    };

    predictionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      findAndCount: jest.fn(),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockEm)),
        findOne: jest.fn(),
      },
    };

    predictionProducer = {
      createPrediction: jest.fn().mockResolvedValue(undefined),
    };
    farmerSettingsService = {
      getOrCreate: jest.fn().mockResolvedValue({ predictionWeeklyLimit: 3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionService,
        { provide: getRepositoryToken(Prediction), useValue: predictionRepo },
        { provide: PredictionProducer, useValue: predictionProducer },
        { provide: FarmerSettingsService, useValue: farmerSettingsService },
      ],
    }).compile();

    service = module.get<PredictionService>(PredictionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateFarmPredictions', () => {
    it('queues prediction job and returns success message on first generation', async () => {
      const farmer = makeFarmer();
      const farm = makeFarm({ farm_images: [makeImage()] });
      mockEm.findOne
        .mockResolvedValueOnce(farmer)   // Farmer
        .mockResolvedValueOnce(farm)     // Farm
        .mockResolvedValueOnce(null);    // PredictionRange — no existing range this week

      const result = await service.generateFarmPredictions('farmer@example.com', 'farm-id-1');

      expect(predictionProducer.createPrediction).toHaveBeenCalledWith({ farmId: 'farm-id-1' });
      expect(result.message).toContain('Prediction initiated');
    });

    it('creates a new PredictionRange with count 1 on first generation', async () => {
      const farmer = makeFarmer();
      const farm = makeFarm({ farm_images: [makeImage()] });
      mockEm.findOne
        .mockResolvedValueOnce(farmer)
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(null);

      await service.generateFarmPredictions('farmer@example.com', 'farm-id-1');

      expect(mockEm.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ regeneration_count: 1 }),
      );
      expect(mockEm.save).toHaveBeenCalled();
    });

    it('increments regeneration_count when range exists and count is below limit', async () => {
      const farmer = makeFarmer();
      const farm = makeFarm({ farm_images: [makeImage()] });
      const range = makePredictionRange({ regeneration_count: 1 });
      mockEm.findOne
        .mockResolvedValueOnce(farmer)
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(range);

      await service.generateFarmPredictions('farmer@example.com', 'farm-id-1');

      expect(range.regeneration_count).toBe(2);
      expect(mockEm.save).toHaveBeenCalledWith(range);
      expect(predictionProducer.createPrediction).toHaveBeenCalled();
    });

    it('allows generation when regeneration_count is exactly 2 (third total run)', async () => {
      const farmer = makeFarmer();
      const farm = makeFarm({ farm_images: [makeImage()] });
      const range = makePredictionRange({ regeneration_count: 2 });
      mockEm.findOne
        .mockResolvedValueOnce(farmer)
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(range);

      await service.generateFarmPredictions('farmer@example.com', 'farm-id-1');

      expect(range.regeneration_count).toBe(3);
      expect(predictionProducer.createPrediction).toHaveBeenCalled();
    });

    it('throws BadRequestException when regeneration_count has reached 3', async () => {
      const farmer = makeFarmer();
      const farm = makeFarm({ farm_images: [makeImage()] });
      const range = makePredictionRange({ regeneration_count: 3 });
      mockEm.findOne
        .mockResolvedValueOnce(farmer)
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(range);

      await expect(
        service.generateFarmPredictions('farmer@example.com', 'farm-id-1'),
      ).rejects.toThrow(new BadRequestException('You have exhausted your 3 predictions for this week'));

      expect(predictionProducer.createPrediction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when farmer is not found', async () => {
      mockEm.findOne.mockResolvedValueOnce(null);

      await expect(
        service.generateFarmPredictions('unknown@example.com', 'farm-id-1'),
      ).rejects.toThrow(new BadRequestException('Farmer not found'));
    });

    it('throws NotFoundException when farm is not found', async () => {
      mockEm.findOne
        .mockResolvedValueOnce(makeFarmer())
        .mockResolvedValueOnce(null);

      await expect(
        service.generateFarmPredictions('farmer@example.com', 'missing-farm'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when farm has no images', async () => {
      mockEm.findOne
        .mockResolvedValueOnce(makeFarmer())
        .mockResolvedValueOnce(makeFarm({ farm_images: [] }));

      await expect(
        service.generateFarmPredictions('farmer@example.com', 'farm-id-1'),
      ).rejects.toThrow(new BadRequestException('Farm must have at least 1 image to generate predictions'));
    });
  });

  describe('listFarmPredictions', () => {
    it('returns paginated predictions', async () => {
      const farm = makeFarm();
      predictionRepo.manager.findOne.mockResolvedValue(farm);
      predictionRepo.findAndCount.mockResolvedValue([[{ id: 'pred-1' }], 1]);

      const result = await service.listFarmPredictions('farmer-id-1', 'farm-id-1', 1, 10);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('throws BadRequestException when farm is not found', async () => {
      predictionRepo.manager.findOne.mockResolvedValue(null);

      await expect(
        service.listFarmPredictions('farmer-id-1', 'missing-farm', 1, 10),
      ).rejects.toThrow(new BadRequestException('Farm not found'));
    });

    it('returns lastPage of 1 when there are no predictions', async () => {
      predictionRepo.manager.findOne.mockResolvedValue(makeFarm());
      predictionRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listFarmPredictions('farmer-id-1', 'farm-id-1', 1, 10);

      expect(result.lastPage).toBe(1);
    });

    it('applies year/month/week filter using Between', async () => {
      predictionRepo.manager.findOne.mockResolvedValue(makeFarm());
      predictionRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.listFarmPredictions('farmer-id-1', 'farm-id-1', 1, 10, 2025, 6, 1);

      const callArgs = predictionRepo.findAndCount.mock.calls[0][0];
      expect(callArgs.where.createdAt).toBeDefined();
    });
  });

});

