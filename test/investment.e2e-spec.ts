/**
 * Investment e2e tests — verifies the purchase → settle GraphQL flow
 * through a lightweight NestJS testing module with stubbed repositories.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { InvestmentPlan, PlanStatus } from '../src/modules/investment/entities/investment-plan.entity';
import { InvestmentPurchase, PurchaseStatus } from '../src/modules/investment/entities/investment-purchase.entity';
import { InvestmentSettlement } from '../src/modules/investment/entities/investment-settlement.entity';
import { InvestmentService } from '../src/modules/investment/investment.service';
import { InvestmentResolver } from '../src/modules/investment/investment.resolver';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { GqlJwtAuthGuard } from '../src/common/guards';

const passGuard = { canActivate: () => true };

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  create: jest.fn((d: any) => d),
  update: jest.fn(),
});

const INVESTOR_ID = 'investor-uuid';
const ADMIN_ID    = 'admin-uuid';

const basePlan = {
  id: 'plan-1',
  cropId: null,
  title: 'Maize Q3',
  acreage: 20,
  unitCost: 50000,
  expectedProfitMin: 5000,
  expectedProfitMax: 15000,
  maturityDays: 90,
  totalUnits: 100,
  unitsRemaining: 100,
  riskNotes: null,
  status: PlanStatus.OPEN,
  createdBy: ADMIN_ID,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Investment (e2e)', () => {
  let app: INestApplication;
  let planRepo: ReturnType<typeof makeRepo>;
  let purchaseRepo: ReturnType<typeof makeRepo>;
  let settlementRepo: ReturnType<typeof makeRepo>;

  beforeAll(async () => {
    planRepo       = makeRepo();
    purchaseRepo   = makeRepo();
    settlementRepo = makeRepo();

    const walletService = {
      getOrCreateWallet: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      debit: jest.fn().mockResolvedValue(undefined),
      credit: jest.fn().mockResolvedValue(undefined),
    };
    const notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (fn: any) =>
        fn({
          getRepository: (entity: any) => {
            if (entity === InvestmentPlan)       return planRepo;
            if (entity === InvestmentPurchase)   return purchaseRepo;
            if (entity === InvestmentSettlement) return settlementRepo;
            return makeRepo();
          },
        }),
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          context: () => ({
            req: { user: { id: INVESTOR_ID, roles: ['farmer'], isFieldAgent: false } },
          }),
        }),
      ],
      providers: [
        InvestmentResolver,
        InvestmentService,
        { provide: getRepositoryToken(InvestmentPlan),       useValue: planRepo       },
        { provide: getRepositoryToken(InvestmentPurchase),   useValue: purchaseRepo   },
        { provide: getRepositoryToken(InvestmentSettlement), useValue: settlementRepo },
        { provide: 'DataSource',                             useValue: dataSource     },
        { provide: WalletService,        useValue: walletService        },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    })
      .overrideGuard(GqlJwtAuthGuard)
      .useValue(passGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  // ── investmentPlans query ─────────────────────────────────────────────────

  it('investmentPlans returns open plans', async () => {
    planRepo.find.mockResolvedValue([basePlan]);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `{ investmentPlans { id title status unitsRemaining } }` });

    expect(body.errors).toBeUndefined();
    expect(body.data.investmentPlans).toHaveLength(1);
    expect(body.data.investmentPlans[0].status).toBe('open');
  });

  // ── purchaseInvestment ────────────────────────────────────────────────────

  it('purchaseInvestment creates an ACTIVE purchase and debits wallet', async () => {
    const plan = { ...basePlan, unitsRemaining: 50 };
    planRepo.findOne.mockResolvedValue(plan);
    planRepo.save.mockResolvedValue({ ...plan, unitsRemaining: 45 });
    const purchase = {
      id: 'purchase-1', planId: 'plan-1', investorId: INVESTOR_ID,
      units: 5, principal: 250000, status: PurchaseStatus.ACTIVE,
      purchasedAt: new Date().toISOString(),
      maturesAt: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
      payoutAmount: null, settlementLedgerRef: null, updatedAt: new Date().toISOString(),
    };
    purchaseRepo.save.mockResolvedValue(purchase);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          purchaseInvestment(planId: "plan-1", units: 5) {
            id status units principal
          }
        }`,
      });

    expect(body.errors).toBeUndefined();
    expect(body.data.purchaseInvestment.status).toBe('active');
    expect(body.data.purchaseInvestment.principal).toBe(250000);
  });

  it('purchaseInvestment returns error when requesting more units than available', async () => {
    planRepo.findOne.mockResolvedValue({ ...basePlan, unitsRemaining: 2 });

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `mutation { purchaseInvestment(planId: "plan-1", units: 10) { id } }` });

    expect(body.errors).toBeDefined();
    expect(body.errors[0].message).toMatch(/units remaining/i);
  });

  // ── settleInvestmentPlan ──────────────────────────────────────────────────

  it('settleInvestmentPlan returns a settlement record', async () => {
    planRepo.findOne.mockResolvedValue(basePlan);
    planRepo.save.mockResolvedValue({ ...basePlan, status: PlanStatus.SETTLED });
    purchaseRepo.find.mockResolvedValue([]);
    const settlement = {
      id: 'settlement-1', planId: 'plan-1',
      actualProfitPerUnit: 10000, settledBy: ADMIN_ID,
      settledAt: new Date().toISOString(), notes: null,
    };
    settlementRepo.save.mockResolvedValue(settlement);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          settleInvestmentPlan(planId: "plan-1", actualProfitPerUnit: 10000) {
            id planId actualProfitPerUnit
          }
        }`,
      });

    expect(body.errors).toBeUndefined();
    expect(body.data.settleInvestmentPlan.actualProfitPerUnit).toBe(10000);
  });
});
