import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import {
  FarmerSubscription,
  SubscriptionStatus,
} from './entities/farmer-subscription.entity';
import {
  PaymentTransaction,
  TransactionStatus,
} from './entities/payment-transaction.entity';
import { PlanName, SubscriptionPlan } from './entities/subscription-plan.entity';
import { SubscriptionPlanService } from './subscription-plan.service';
import { PaymentService } from './payment.service';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { FarmerSettings } from '../farmer/entities/farmer-settings.entity';

const makePlan = (
  name: PlanName,
  overrides: Partial<SubscriptionPlan> = {},
): SubscriptionPlan =>
  ({
    id: `plan-${name}`,
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    priceAmount: name === PlanName.FREE ? 0 : name === PlanName.POPULAR ? 2000 : 5000,
    currency: 'GHS',
    predictionWeeklyLimit: name === PlanName.FREE ? 3 : name === PlanName.POPULAR ? 15 : 50,
    farmDataLookbackSeconds: 3600,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalSeconds: 3600,
    maxFarms: 2,
    features: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as SubscriptionPlan;

const makeSubscription = (
  overrides: Partial<FarmerSubscription> = {},
): FarmerSubscription =>
  ({
    id: 'sub-uuid-1',
    plan: makePlan(PlanName.FREE),
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date(),
    currentPeriodEnd: null,
    paystackCustomerCode: null,
    paystackSubscriptionCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    farmer: { id: 'farmer-1' } as any,
    ...overrides,
  }) as FarmerSubscription;

const makeTransaction = (
  overrides: Partial<PaymentTransaction> = {},
): PaymentTransaction =>
  ({
    id: 'tx-uuid-1',
    paystackReference: 'ref_abc123',
    paystackAccessCode: 'access_abc',
    amount: 2000,
    currency: 'GHS',
    status: TransactionStatus.PENDING,
    planId: 'plan-popular',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    farmer: { id: 'farmer-1' } as any,
    subscription: null,
    ...overrides,
  }) as PaymentTransaction;

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subscriptionRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let transactionRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let planService: {
    findByName: jest.Mock;
    findById: jest.Mock;
  };
  let paymentService: {
    initializeTransaction: jest.Mock;
    verifyTransaction: jest.Mock;
  };
  let settingsService: {
    update: jest.Mock;
  };

  beforeEach(async () => {
    subscriptionRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    transactionRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    planService = {
      findByName: jest.fn(),
      findById: jest.fn(),
    };
    paymentService = {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
    };
    settingsService = {
      update: jest.fn().mockResolvedValue({} as FarmerSettings),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: getRepositoryToken(FarmerSubscription),
          useValue: subscriptionRepo,
        },
        {
          provide: getRepositoryToken(PaymentTransaction),
          useValue: transactionRepo,
        },
        { provide: SubscriptionPlanService, useValue: planService },
        { provide: PaymentService, useValue: paymentService },
        { provide: FarmerSettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('assignFreePlan', () => {
    it('creates an active free subscription and syncs settings', async () => {
      const freePlan = makePlan(PlanName.FREE);
      const sub = makeSubscription({ plan: freePlan });
      planService.findByName.mockResolvedValue(freePlan);
      subscriptionRepo.create.mockReturnValue(sub);
      subscriptionRepo.save.mockResolvedValue(sub);

      const result = await service.assignFreePlan('farmer-1');

      expect(planService.findByName).toHaveBeenCalledWith(PlanName.FREE);
      expect(subscriptionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: null,
        }),
      );
      expect(result).toBe(sub);
      expect(settingsService.update).toHaveBeenCalledWith(
        'farmer-1',
        expect.objectContaining({ predictionWeeklyLimit: freePlan.predictionWeeklyLimit }),
      );
    });

    it('throws NotFoundException when free plan not seeded yet', async () => {
      planService.findByName.mockResolvedValue(null);

      await expect(service.assignFreePlan('farmer-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getActiveSubscription', () => {
    it('returns an existing active subscription', async () => {
      const sub = makeSubscription();
      subscriptionRepo.findOne.mockResolvedValue(sub);

      const result = await service.getActiveSubscription('farmer-1');

      expect(result).toBe(sub);
      expect(planService.findByName).not.toHaveBeenCalled();
    });

    it('assigns a free plan for old accounts without a subscription', async () => {
      const freePlan = makePlan(PlanName.FREE);
      const newSub = makeSubscription({ plan: freePlan });
      subscriptionRepo.findOne.mockResolvedValue(null);
      planService.findByName.mockResolvedValue(freePlan);
      subscriptionRepo.create.mockReturnValue(newSub);
      subscriptionRepo.save.mockResolvedValue(newSub);

      const result = await service.getActiveSubscription('farmer-1');

      expect(planService.findByName).toHaveBeenCalledWith(PlanName.FREE);
      expect(result).toBe(newSub);
    });
  });

  describe('initiatePayment', () => {
    it('throws NotFoundException for an unknown plan', async () => {
      planService.findById.mockResolvedValue(null);

      await expect(
        service.initiatePayment('farmer-1', 'farmer@example.com', 'nonexistent-plan'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when attempting to pay for the free plan', async () => {
      planService.findById.mockResolvedValue(makePlan(PlanName.FREE));

      await expect(
        service.initiatePayment('farmer-1', 'farmer@example.com', 'plan-free'),
      ).rejects.toThrow(BadRequestException);
    });

    it('initiates full-price payment for a farmer with no current paid subscription', async () => {
      const popularPlan = makePlan(PlanName.POPULAR);
      planService.findById.mockResolvedValue(popularPlan);
      subscriptionRepo.findOne.mockResolvedValue(null);
      paymentService.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/xyz',
        accessCode: 'acc_xyz',
      });
      transactionRepo.create.mockReturnValue(makeTransaction());
      transactionRepo.save.mockResolvedValue(makeTransaction());

      const result = await service.initiatePayment(
        'farmer-1',
        'farmer@example.com',
        'plan-popular',
      );

      expect(paymentService.initializeTransaction).toHaveBeenCalledWith(
        'farmer@example.com',
        popularPlan.priceAmount,
        expect.any(String),
        expect.any(Object),
      );
      expect(result.authorizationUrl).toBe('https://paystack.com/pay/xyz');
      expect(result.reference).toBeDefined();
    });

    it('applies proration credit when upgrading from a paid plan mid-period', async () => {
      const popularPlan = makePlan(PlanName.POPULAR, { priceAmount: 2000 });
      const premiumPlan = makePlan(PlanName.PREMIUM, { priceAmount: 5000 });

      // Current subscription: popular, with 15 days of 30 remaining
      const periodStart = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const currentSub = makeSubscription({
        plan: popularPlan,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      planService.findById.mockResolvedValue(premiumPlan);
      subscriptionRepo.findOne.mockResolvedValue(currentSub);
      paymentService.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/upgrade',
        accessCode: 'acc_upgrade',
      });
      transactionRepo.create.mockReturnValue(makeTransaction({ amount: 4000 }));
      transactionRepo.save.mockResolvedValue(makeTransaction({ amount: 4000 }));

      await service.initiatePayment('farmer-1', 'farmer@example.com', 'plan-premium');

      const [, amount] = paymentService.initializeTransaction.mock.calls[0];
      // Credit ~1000 (half of 2000), so charged ~4000
      expect(amount).toBeLessThan(premiumPlan.priceAmount);
      expect(amount).toBeGreaterThan(0);
    });

    it('activates immediately when credit covers full new plan cost (downgrade)', async () => {
      const premiumPlan = makePlan(PlanName.PREMIUM, { priceAmount: 5000 });
      const popularPlan = makePlan(PlanName.POPULAR, { priceAmount: 2000 });

      // Premium with 29 of 30 days remaining → credit ~4833 > popular cost 2000
      const periodStart = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
      const currentSub = makeSubscription({
        plan: premiumPlan,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      planService.findById.mockResolvedValue(popularPlan);
      subscriptionRepo.findOne.mockResolvedValue(currentSub);
      subscriptionRepo.save.mockResolvedValue({ ...currentSub, plan: popularPlan });

      const result = await service.initiatePayment(
        'farmer-1',
        'farmer@example.com',
        'plan-popular',
      );

      // No Paystack call — immediate activation
      expect(paymentService.initializeTransaction).not.toHaveBeenCalled();
      expect(subscriptionRepo.save).toHaveBeenCalled();
      expect(result.authorizationUrl).toBe('');
      expect(settingsService.update).toHaveBeenCalledWith(
        'farmer-1',
        expect.objectContaining({ predictionWeeklyLimit: popularPlan.predictionWeeklyLimit }),
      );
    });
  });

  describe('activateSubscription', () => {
    it('activates subscription and syncs settings on successful payment', async () => {
      const popularPlan = makePlan(PlanName.POPULAR);
      const tx = makeTransaction({
        status: TransactionStatus.PENDING,
        planId: popularPlan.id,
      });
      transactionRepo.findOne.mockResolvedValue(tx);
      paymentService.verifyTransaction.mockResolvedValue({
        status: 'success',
        reference: tx.paystackReference,
        amount: 2000,
        currency: 'GHS',
        customer: { email: 'farmer@example.com', customer_code: 'CUS_abc' },
        metadata: {},
      });
      planService.findById.mockResolvedValue(popularPlan);
      subscriptionRepo.update.mockResolvedValue({});
      const newSub = makeSubscription({ plan: popularPlan });
      subscriptionRepo.create.mockReturnValue(newSub);
      subscriptionRepo.save.mockResolvedValue(newSub);
      transactionRepo.save.mockResolvedValue({ ...tx, status: TransactionStatus.SUCCESS });

      await service.activateSubscription(tx.paystackReference);

      expect(subscriptionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
        { status: SubscriptionStatus.EXPIRED },
      );
      expect(subscriptionRepo.save).toHaveBeenCalled();
      expect(transactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TransactionStatus.SUCCESS }),
      );
      expect(settingsService.update).toHaveBeenCalledWith(
        'farmer-1',
        expect.objectContaining({ predictionWeeklyLimit: popularPlan.predictionWeeklyLimit }),
      );
    });

    it('marks transaction as failed when Paystack reports payment not successful', async () => {
      const tx = makeTransaction({ status: TransactionStatus.PENDING });
      transactionRepo.findOne.mockResolvedValue(tx);
      paymentService.verifyTransaction.mockResolvedValue({
        status: 'failed',
        reference: tx.paystackReference,
        amount: 2000,
        currency: 'GHS',
        customer: { email: 'farmer@example.com', customer_code: 'CUS_abc' },
        metadata: {},
      });
      transactionRepo.save.mockResolvedValue({ ...tx, status: TransactionStatus.FAILED });

      await service.activateSubscription(tx.paystackReference);

      expect(transactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TransactionStatus.FAILED }),
      );
      expect(subscriptionRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when transaction reference does not exist', async () => {
      transactionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.activateSubscription('unknown_ref'),
      ).rejects.toThrow(NotFoundException);
    });

    it('is idempotent — does nothing when transaction already succeeded', async () => {
      const tx = makeTransaction({ status: TransactionStatus.SUCCESS });
      transactionRepo.findOne.mockResolvedValue(tx);

      await service.activateSubscription(tx.paystackReference);

      expect(paymentService.verifyTransaction).not.toHaveBeenCalled();
      expect(subscriptionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getPlanHierarchy', () => {
    it('returns 0 for free plan', () => {
      expect(service.getPlanHierarchy(PlanName.FREE)).toBe(0);
    });

    it('returns 1 for popular plan', () => {
      expect(service.getPlanHierarchy(PlanName.POPULAR)).toBe(1);
    });

    it('returns 2 for premium plan', () => {
      expect(service.getPlanHierarchy(PlanName.PREMIUM)).toBe(2);
    });

    it('returns 0 for unknown plan names', () => {
      expect(service.getPlanHierarchy('unknown')).toBe(0);
    });
  });
});
