import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvestmentService } from './investment.service';
import { InvestmentPlan, PlanStatus } from './entities/investment-plan.entity';
import { InvestmentPurchase, PurchaseStatus } from './entities/investment-purchase.entity';
import { InvestmentSettlement } from './entities/investment-settlement.entity';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerAccount } from '../wallet/entities/ledger-entry.entity';

const makeRepo = (overrides: Partial<any> = {}) => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
  update: jest.fn(),
  ...overrides,
});

const makePlan = (overrides: Partial<InvestmentPlan> = {}): InvestmentPlan =>
  ({
    id: 'plan-1',
    title: 'Maize Q3',
    cropId: 'crop-1',
    unitCost: 50000,     // 500 GHS per unit
    expectedProfitMin: 5000,
    expectedProfitMax: 15000,
    maturityDays: 90,
    totalUnits: 100,
    unitsRemaining: 100,
    status: PlanStatus.OPEN,
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as InvestmentPlan);

const makePurchase = (overrides: Partial<InvestmentPurchase> = {}): InvestmentPurchase =>
  ({
    id: 'purchase-1',
    planId: 'plan-1',
    investorId: 'investor-1',
    units: 5,
    principal: 250000, // 5 × 50000
    status: PurchaseStatus.ACTIVE,
    purchasedAt: new Date(),
    maturesAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    payoutAmount: null,
    settlementLedgerRef: null,
    updatedAt: new Date(),
    ...overrides,
  } as InvestmentPurchase);

describe('InvestmentService', () => {
  let service: InvestmentService;
  let planRepo: ReturnType<typeof makeRepo>;
  let purchaseRepo: ReturnType<typeof makeRepo>;
  let settlementRepo: ReturnType<typeof makeRepo>;
  let walletService: { getOrCreateWallet: jest.Mock; debit: jest.Mock; credit: jest.Mock };
  let notificationsService: { create: jest.Mock };
  let dataSource: any;

  beforeEach(async () => {
    planRepo        = makeRepo();
    purchaseRepo    = makeRepo();
    settlementRepo  = makeRepo();
    walletService   = { getOrCreateWallet: jest.fn(), debit: jest.fn(), credit: jest.fn() };
    notificationsService = { create: jest.fn() };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (fn: (em: any) => Promise<any>) => {
        const em = {
          getRepository: jest.fn().mockImplementation((entity: any) => {
            if (entity === InvestmentPlan) return planRepo;
            if (entity === InvestmentPurchase) return purchaseRepo;
            if (entity === InvestmentSettlement) return settlementRepo;
            return makeRepo();
          }),
        };
        return fn(em);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestmentService,
        { provide: getRepositoryToken(InvestmentPlan),       useValue: planRepo        },
        { provide: getRepositoryToken(InvestmentPurchase),   useValue: purchaseRepo    },
        { provide: getRepositoryToken(InvestmentSettlement), useValue: settlementRepo  },
        { provide: DataSource,                               useValue: dataSource      },
        { provide: WalletService,        useValue: walletService        },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<InvestmentService>(InvestmentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── purchase ───────────────────────────────────────────────────────────────

  describe('purchase', () => {
    it('debits correct amount and creates purchase record', async () => {
      const plan = makePlan({ unitsRemaining: 10 });
      planRepo.findOne.mockResolvedValue(plan);
      planRepo.save.mockResolvedValue({ ...plan, unitsRemaining: 5 });
      const wallet = { id: 'wallet-1' };
      walletService.getOrCreateWallet.mockResolvedValue(wallet);
      walletService.debit.mockResolvedValue(undefined);
      const purchase = makePurchase({ units: 5, principal: 250000 });
      purchaseRepo.save.mockResolvedValue(purchase);
      notificationsService.create.mockResolvedValue(undefined);

      const result = await service.purchase('plan-1', 'investor-1', 5);

      expect(walletService.debit).toHaveBeenCalledWith(
        'wallet-1', 250000, LedgerAccount.INVESTMENT_POOL, expect.any(String), expect.anything(),
      );
      expect(plan.unitsRemaining).toBe(5); // decremented in-place
      expect(result).toBe(purchase);
    });

    it('throws BadRequestException when requesting more units than remaining', async () => {
      planRepo.findOne.mockResolvedValue(makePlan({ unitsRemaining: 3 }));
      await expect(service.purchase('plan-1', 'investor-1', 10)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when plan is not OPEN', async () => {
      planRepo.findOne.mockResolvedValue(makePlan({ status: PlanStatus.CLOSED }));
      await expect(service.purchase('plan-1', 'investor-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      planRepo.findOne.mockResolvedValue(null);
      await expect(service.purchase('bad-plan', 'investor-1', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── settle — payout math ──────────────────────────────────────────────────

  describe('settle', () => {
    const setupSettle = (purchases: InvestmentPurchase[]) => {
      const plan = makePlan({ status: PlanStatus.OPEN });
      planRepo.findOne.mockResolvedValue(plan);
      planRepo.save.mockResolvedValue({ ...plan, status: PlanStatus.SETTLED });
      purchaseRepo.find.mockResolvedValue(purchases);
      walletService.getOrCreateWallet.mockResolvedValue({ id: 'wallet-1' });
      walletService.credit.mockResolvedValue(undefined);
      notificationsService.create.mockResolvedValue(undefined);
      settlementRepo.save.mockResolvedValue({ id: 'settlement-1' });
    };

    it('credits payout = principal + units × actualProfitPerUnit for positive profit', async () => {
      const purchase = makePurchase({ units: 5, principal: 250000 }); // 5 units × 50000
      setupSettle([purchase]);

      // actualProfitPerUnit = 10000 → payout = 250000 + 5 × 10000 = 300000
      await service.settle('plan-1', 10000, undefined, 'admin-1');

      expect(walletService.credit).toHaveBeenCalledWith(
        'wallet-1', 300000, LedgerAccount.USER_CASH, expect.any(String), expect.anything(),
      );
    });

    it('pays out reduced amount when profit is negative (no guaranteed return)', async () => {
      const purchase = makePurchase({ units: 5, principal: 250000 });
      setupSettle([purchase]);

      // actualProfitPerUnit = −5000 → payout = 250000 + 5 × (−5000) = 225000
      await service.settle('plan-1', -5000, undefined, 'admin-1');

      expect(walletService.credit).toHaveBeenCalledWith(
        'wallet-1', 225000, LedgerAccount.USER_CASH, expect.any(String), expect.anything(),
      );
    });

    it('clamps payout to 0 when loss exceeds principal', async () => {
      const purchase = makePurchase({ units: 5, principal: 250000 });
      setupSettle([purchase]);

      // actualProfitPerUnit = −60000 → raw payout = 250000 − 300000 = −50000 → clamp to 0
      await service.settle('plan-1', -60000, undefined, 'admin-1');

      expect(walletService.credit).toHaveBeenCalledWith(
        'wallet-1', 0, LedgerAccount.USER_CASH, expect.any(String), expect.anything(),
      );
    });

    it('marks all active purchases as SETTLED', async () => {
      const p1 = makePurchase({ id: 'p1', units: 2, principal: 100000 });
      const p2 = makePurchase({ id: 'p2', units: 3, principal: 150000 });
      setupSettle([p1, p2]);

      await service.settle('plan-1', 5000, 'Good harvest', 'admin-1');

      expect(purchaseRepo.save).toHaveBeenCalledTimes(2);
      expect(p1.status).toBe(PurchaseStatus.SETTLED);
      expect(p2.status).toBe(PurchaseStatus.SETTLED);
    });

    it('sets plan status to SETTLED after processing', async () => {
      setupSettle([]);
      await service.settle('plan-1', 0, undefined, 'admin-1');
      expect(planRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PlanStatus.SETTLED }),
      );
    });

    it('sends a notification to each investor', async () => {
      const p1 = makePurchase({ id: 'p1', investorId: 'investor-a', units: 1, principal: 50000 });
      const p2 = makePurchase({ id: 'p2', investorId: 'investor-b', units: 1, principal: 50000 });
      setupSettle([p1, p2]);

      await service.settle('plan-1', 0, undefined, 'admin-1');

      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith('investor-a', expect.any(Object));
      expect(notificationsService.create).toHaveBeenCalledWith('investor-b', expect.any(Object));
    });
  });
});
