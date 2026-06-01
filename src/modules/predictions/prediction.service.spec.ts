import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PredictionService } from './prediction.service';
import { Prediction } from './entities/prediction.entity';
import { PredictionProducer } from './prediction.producer';
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

describe('PredictionService', () => {
  let service: PredictionService;
  let predictionRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    manager: {
      transaction: jest.Mock;
      findOne: jest.Mock;
    };
  };
  let predictionProducer: { createPrediction: jest.Mock };
  let mockEm: { findOne: jest.Mock };

  beforeEach(async () => {
    mockEm = { findOne: jest.fn() };

    predictionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockEm)),
        findOne: jest.fn(),
      },
    };

    predictionProducer = {
      createPrediction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionService,
        { provide: getRepositoryToken(Prediction), useValue: predictionRepo },
        { provide: PredictionProducer, useValue: predictionProducer },
      ],
    }).compile();

    service = module.get<PredictionService>(PredictionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateFarmPredictions', () => {
    it('queues prediction job and returns success message', async () => {
      const farmer = makeFarmer();
      const farm = makeFarm({ farm_images: [makeImage()] });
      mockEm.findOne
        .mockResolvedValueOnce(farmer)
        .mockResolvedValueOnce(farm);

      const result = await service.generateFarmPredictions('farmer@example.com', 'farm-id-1');

      expect(predictionProducer.createPrediction).toHaveBeenCalledWith({ farmId: 'farm-id-1' });
      expect(result.message).toContain('Prediction initiated');
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

  describe('createPredictions', () => {
    it('throws NotFoundException when farm is not found', async () => {
      predictionRepo.manager.findOne.mockResolvedValue(null);

      await expect(service.createPredictions('missing-farm')).rejects.toThrow(NotFoundException);
    });

    it('creates one prediction per image per prediction type and saves in bulk', async () => {
      const images = [
        makeImage([PredictionType.DISEASE_PREDICTION, PredictionType.YIELD_PREDICTION]),
        makeImage([PredictionType.DISEASE_PREDICTION, PredictionType.YIELD_PREDICTION]),
      ];
      const farm = makeFarm({ farm_images: images });
      predictionRepo.manager.findOne.mockResolvedValue(farm);
      predictionRepo.create.mockImplementation((pred: any) => pred);
      predictionRepo.save.mockResolvedValue([]);

      await service.createPredictions('farm-id-1');

      expect(predictionRepo.create).toHaveBeenCalledTimes(4);
      expect(predictionRepo.save).toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]));
      const savedArray = predictionRepo.save.mock.calls[0][0];
      expect(savedArray).toHaveLength(4);
    });

    it('does not call save when farm has no images', async () => {
      const farm = makeFarm({ farm_images: [] });
      predictionRepo.manager.findOne.mockResolvedValue(farm);

      await service.createPredictions('farm-id-1');

      expect(predictionRepo.save).not.toHaveBeenCalled();
    });
  });
});
