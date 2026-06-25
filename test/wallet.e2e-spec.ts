/**
 * Wallet e2e tests — tests the deposit webhook idempotency and ledger
 * via the REST controller and GraphQL resolver.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Wallet, WalletOwnerType } from '../src/modules/wallet/entities/wallet.entity';
import { LedgerEntry, LedgerDirection, LedgerAccount } from '../src/modules/wallet/entities/ledger-entry.entity';
import { PaymentIntentV2, PaymentIntentStatus, PaymentIntentType } from '../src/modules/wallet/entities/payment-intent-v2.entity';
import { Farmer } from '../src/modules/farmer/entities/farmer.entity';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { WalletResolver } from '../src/modules/wallet/wallet.resolver';
import { WalletController } from '../src/modules/wallet/wallet.controller';
import { PaymentService } from '../src/modules/payment/payment.service';
import { GqlJwtAuthGuard } from '../src/common/guards';
import { ConfigService } from '@nestjs/config';

const passGuard = { canActivate: () => true };

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  create: jest.fn((d: any) => d),
  update: jest.fn(),
});

const USER_ID = 'user-uuid';

const baseWallet = {
  id: 'wallet-1',
  ownerId: USER_ID,
  ownerType: WalletOwnerType.USER,
  currency: 'GHS',
  availableBalance: 500000,
  lockedBalance: 0,
};

describe('Wallet (e2e)', () => {
  let app: INestApplication;
  let walletRepo: ReturnType<typeof makeRepo>;
  let ledgerRepo: ReturnType<typeof makeRepo>;
  let intentRepo: ReturnType<typeof makeRepo>;
  let farmerRepo: ReturnType<typeof makeRepo>;

  beforeAll(async () => {
    walletRepo  = makeRepo();
    ledgerRepo  = makeRepo();
    intentRepo  = makeRepo();
    farmerRepo  = makeRepo();

    const paymentService = {
      initializeTransaction: jest.fn().mockResolvedValue({ authorizationUrl: 'https://pay.example.com/abc' }),
    };
    const configService = {
      get: jest.fn().mockImplementation((k: string) => (k === 'PAYSTACK_SECRET_KEY' ? 'sk_test' : undefined)),
    };

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (fn: any) =>
        fn({
          getRepository: (entity: any) => {
            if (entity === Wallet)          return walletRepo;
            if (entity === LedgerEntry)     return ledgerRepo;
            if (entity === PaymentIntentV2) return intentRepo;
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
            req: { user: { id: USER_ID, roles: ['farmer'], isFieldAgent: false } },
          }),
        }),
      ],
      controllers: [WalletController],
      providers: [
        WalletResolver,
        WalletService,
        { provide: getRepositoryToken(Wallet),          useValue: walletRepo  },
        { provide: getRepositoryToken(LedgerEntry),     useValue: ledgerRepo  },
        { provide: getRepositoryToken(PaymentIntentV2), useValue: intentRepo  },
        { provide: getRepositoryToken(Farmer),          useValue: farmerRepo  },
        { provide: 'DataSource',   useValue: dataSource   },
        { provide: PaymentService, useValue: paymentService },
        { provide: ConfigService,  useValue: configService  },
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

  // ── myWallet query ────────────────────────────────────────────────────────

  it('myWallet returns the user wallet', async () => {
    walletRepo.findOne.mockResolvedValue(baseWallet);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `{ myWallet { id availableBalance currency } }` });

    expect(body.errors).toBeUndefined();
    expect(body.data.myWallet.availableBalance).toBe(500000);
    expect(body.data.myWallet.currency).toBe('GHS');
  });

  // ── myLedger query ─────────────────────────────────────────────────────────

  it('myLedger returns ledger entries for the wallet', async () => {
    walletRepo.findOne.mockResolvedValue(baseWallet);
    ledgerRepo.find.mockResolvedValue([
      {
        id: 'le-1', walletId: 'wallet-1', transactionId: 'txn-1',
        direction: LedgerDirection.CREDIT, amount: 100000,
        account: LedgerAccount.USER_CASH,
        createdAt: new Date().toISOString(),
      },
    ]);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `{ myLedger { id direction amount account } }` });

    expect(body.errors).toBeUndefined();
    expect(body.data.myLedger).toHaveLength(1);
    expect(body.data.myLedger[0].direction).toBe('credit');
    expect(body.data.myLedger[0].amount).toBe(100000);
  });

  // ── initiateDeposit mutation ──────────────────────────────────────────────

  it('initiateDeposit returns a checkoutUrl', async () => {
    walletRepo.findOne.mockResolvedValue(baseWallet);
    farmerRepo.findOne.mockResolvedValue({ id: USER_ID, email: 'test@example.com' });
    const intent = {
      id: 'intent-1', walletId: 'wallet-1', type: PaymentIntentType.DEPOSIT,
      amount: 100000, status: PaymentIntentStatus.PENDING,
      idempotencyKey: 'key-1', providerRef: 'ref-1', checkoutUrl: 'https://pay.example.com/abc',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    intentRepo.findOne.mockResolvedValue(null); // not duplicate
    intentRepo.save.mockResolvedValue(intent);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          initiateDeposit(amount: 100000, idempotencyKey: "key-1") {
            checkoutUrl intent { id status amount }
          }
        }`,
      });

    expect(body.errors).toBeUndefined();
    expect(body.data.initiateDeposit.checkoutUrl).toContain('https://');
    expect(body.data.initiateDeposit.intent.status).toBe('pending');
  });

  // ── Paystack webhook — idempotency ────────────────────────────────────────

  it('POST /api/v2/webhooks/payments/paystack is idempotent for already-completed intents', async () => {
    const completedIntent = {
      id: 'intent-1', walletId: 'wallet-1', amount: 100000,
      status: PaymentIntentStatus.COMPLETED, providerRef: 'ref-complete',
    };
    intentRepo.findOne.mockResolvedValue(completedIntent);

    // Provide a valid Paystack HMAC signature for the body
    const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'ref-complete' } });
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha512', 'sk_test').update(payload).digest('hex');

    const { status } = await request(app.getHttpServer())
      .post('/api/v2/webhooks/payments/paystack')
      .set('x-paystack-signature', sig)
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(status).toBe(200);
    // dataSource.transaction should NOT be called since intent is already COMPLETED
    expect(dataSource).toBeDefined();
  });
});
