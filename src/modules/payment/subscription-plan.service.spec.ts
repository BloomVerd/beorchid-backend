import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SubscriptionPlanService } from './subscription-plan.service';
import {
  PlanName,
  SubscriptionPlan,
} from './entities/subscription-plan.entity';

const makePlan = (overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan =>
  ({
    id: 'plan-uuid-1',
    name: PlanName.FREE,
    displayName: 'Free',
    priceAmount: 0,
    currency: 'GHS',
    durationDays: 0,
    predictionWeeklyLimit: 3,
    farmDataLookbackSeconds: 3600,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalSeconds: 3600,
    maxFarms: 2,
    features: ['Up to 2 farms'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as SubscriptionPlan;

describe('SubscriptionPlanService', () => {
  let service: SubscriptionPlanService;
  let planRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    planRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionPlanService,
        { provide: getRepositoryToken(SubscriptionPlan), useValue: planRepo },
      ],
    }).compile();

    service = module.get<SubscriptionPlanService>(SubscriptionPlanService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('setupPlans', () => {
    it('creates all three plans when none exist', async () => {
      planRepo.findOne.mockResolvedValue(null);
      planRepo.create.mockImplementation((data) => ({ ...data }));
      planRepo.save.mockResolvedValue({});

      await service.setupPlans();

      expect(planRepo.findOne).toHaveBeenCalledTimes(3);
      expect(planRepo.save).toHaveBeenCalledTimes(3);
      const savedNames = planRepo.save.mock.calls.map((c) => c[0].name);
      expect(savedNames).toContain(PlanName.FREE);
      expect(savedNames).toContain(PlanName.POPULAR);
      expect(savedNames).toContain(PlanName.PREMIUM);
    });

    it('upserts the existing plan and creates the two missing ones', async () => {
      planRepo.findOne
        .mockResolvedValueOnce(makePlan({ name: PlanName.FREE }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      planRepo.create.mockImplementation((data) => ({ ...data }));
      planRepo.save.mockResolvedValue({});

      await service.setupPlans();

      // 1 upsert for the existing plan + 2 creates for the missing ones
      expect(planRepo.save).toHaveBeenCalledTimes(3);
    });

    it('upserts all plans when all already exist', async () => {
      planRepo.findOne.mockResolvedValue(makePlan());
      planRepo.save.mockResolvedValue({});

      await service.setupPlans();

      expect(planRepo.save).toHaveBeenCalledTimes(3);
    });
  });

  describe('findAll', () => {
    it('returns all active plans', async () => {
      const plans = [
        makePlan({ name: PlanName.FREE }),
        makePlan({ id: 'plan-2', name: PlanName.POPULAR }),
      ];
      planRepo.find.mockResolvedValue(plans);

      const result = await service.findAll();

      expect(result).toBe(plans);
      expect(planRepo.find).toHaveBeenCalledWith({ where: { isActive: true } });
    });
  });

  describe('findById', () => {
    it('returns a plan by id', async () => {
      const plan = makePlan();
      planRepo.findOne.mockResolvedValue(plan);

      const result = await service.findById('plan-uuid-1');

      expect(result).toBe(plan);
      expect(planRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'plan-uuid-1' },
      });
    });

    it('returns null when plan does not exist', async () => {
      planRepo.findOne.mockResolvedValue(null);

      const result = await service.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('returns a plan by name', async () => {
      const plan = makePlan({ name: PlanName.PREMIUM });
      planRepo.findOne.mockResolvedValue(plan);

      const result = await service.findByName(PlanName.PREMIUM);

      expect(result).toBe(plan);
      expect(planRepo.findOne).toHaveBeenCalledWith({
        where: { name: PlanName.PREMIUM },
      });
    });
  });
});
