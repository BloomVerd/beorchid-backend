import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FarmerService } from './farmer.service';
import { Farmer } from './entities/farmer.entity';

const makeFarmer = (overrides: Partial<Farmer> = {}): Farmer =>
  ({
    id: 'farmer-id-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    country: 'GH',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    farms: [],
    ...overrides,
  }) as Farmer;

describe('FarmerService', () => {
  let service: FarmerService;
  let farmerRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    farmerRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmerService,
        { provide: getRepositoryToken(Farmer), useValue: farmerRepo },
      ],
    }).compile();

    service = module.get<FarmerService>(FarmerService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findById', () => {
    it('returns the farmer when found', async () => {
      const farmer = makeFarmer();
      farmerRepo.findOne.mockResolvedValue(farmer);

      const result = await service.findById('farmer-id-1');

      expect(result).toBe(farmer);
      expect(farmerRepo.findOne).toHaveBeenCalledWith({ where: { id: 'farmer-id-1' } });
    });

    it('throws NotFoundException when farmer is not found', async () => {
      farmerRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        new NotFoundException('Farmer not found'),
      );
    });
  });

  describe('findByEmail', () => {
    it('returns the farmer when found', async () => {
      const farmer = makeFarmer();
      farmerRepo.findOne.mockResolvedValue(farmer);

      const result = await service.findByEmail('john@example.com');

      expect(result).toBe(farmer);
      expect(farmerRepo.findOne).toHaveBeenCalledWith({ where: { email: 'john@example.com' } });
    });

    it('returns null when farmer is not found (no exception)', async () => {
      farmerRepo.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByEmailWithPassword', () => {
    it('returns farmer with passwordHash via query builder', async () => {
      const farmer = makeFarmer({ passwordHash: 'hashed' } as any);
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(farmer),
      };
      farmerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByEmailWithPassword('john@example.com');

      expect(result).toBe(farmer);
      expect(qb.addSelect).toHaveBeenCalledWith('farmer.passwordHash');
      expect(qb.where).toHaveBeenCalledWith('farmer.email = :email', { email: 'john@example.com' });
    });

    it('returns null when farmer is not found', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      farmerRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByEmailWithPassword('unknown@example.com');

      expect(result).toBeNull();
    });
  });
});
