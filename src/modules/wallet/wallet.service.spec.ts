import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { Wallet, WalletOwnerType } from './entities/wallet.entity';
import { LedgerEntry, LedgerDirection, LedgerAccount } from './entities/ledger-entry.entity';
import { PaymentIntentV2, PaymentIntentStatus, PaymentIntentType } from './entities/payment-intent-v2.entity';
import { Farmer } from '../farmer/entities/farmer.entity';
import { PaymentService } from '../payment/payment.service';

const makeRepo = (overrides: Partial<any> = {}) => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
  update: jest.fn(),
  ...overrides,
});

const makeWallet = (availableBalance = 100000): Wallet =>
  ({ id: 'wallet-1', ownerId: 'user-1', ownerType: WalletOwnerType.USER, currency: 'GHS', availableBalance, lockedBalance: 0 } as Wallet);

describe('WalletService', () => {
  let service: WalletService;
  let walletRepo: ReturnType<typeof makeRepo>;
  let ledgerRepo: ReturnType<typeof makeRepo>;
  let intentRepo: ReturnType<typeof makeRepo>;
  let farmerRepo: ReturnType<typeof makeRepo>;
  let dataSource: any;

  beforeEach(async () => {
    walletRepo  = makeRepo();
    ledgerRepo  = makeRepo();
    intentRepo  = makeRepo();
    farmerRepo  = makeRepo();
    dataSource  = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(Wallet),          useValue: walletRepo  },
        { provide: getRepositoryToken(LedgerEntry),     useValue: ledgerRepo  },
        { provide: getRepositoryToken(PaymentIntentV2), useValue: intentRepo  },
        { provide: getRepositoryToken(Farmer),          useValue: farmerRepo  },
        { provide: DataSource,                           useValue: dataSource  },
        { provide: PaymentService, useValue: { initializeTransaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getOrCreateWallet ──────────────────────────────────────────────────────

  describe('getOrCreateWallet', () => {
    it('returns existing wallet when found', async () => {
      const wallet = makeWallet();
      walletRepo.findOne.mockResolvedValue(wallet);
      const result = await service.getOrCreateWallet('user-1');
      expect(result).toBe(wallet);
      expect(walletRepo.save).not.toHaveBeenCalled();
    });

    it('creates and returns new wallet when not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      const newWallet = makeWallet(0);
      walletRepo.save.mockResolvedValue(newWallet);
      const result = await service.getOrCreateWallet('user-1');
      expect(walletRepo.save).toHaveBeenCalled();
      expect(result).toBe(newWallet);
    });
  });

  // ── debit ─────────────────────────────────────────────────────────────────

  describe('debit', () => {
    it('reduces available balance and writes debit ledger entry', async () => {
      const wallet = makeWallet(50000);
      walletRepo.findOne.mockResolvedValue(wallet);
      walletRepo.save.mockResolvedValue({ ...wallet, availableBalance: 30000 });
      const ledgerEntry = { id: 'le-1' };
      ledgerRepo.save.mockResolvedValue(ledgerEntry);

      await service.debit('wallet-1', 20000, LedgerAccount.ESCROW, 'txn-1');

      expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ availableBalance: 30000 }));
      expect(ledgerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ direction: LedgerDirection.DEBIT, amount: 20000, account: LedgerAccount.ESCROW }),
      );
    });

    it('throws BadRequestException when balance is insufficient', async () => {
      walletRepo.findOne.mockResolvedValue(makeWallet(100));
      await expect(service.debit('wallet-1', 200, LedgerAccount.ESCROW, 'txn-2')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      await expect(service.debit('wallet-x', 100, LedgerAccount.ESCROW, 'txn-3')).rejects.toThrow(NotFoundException);
    });
  });

  // ── credit ────────────────────────────────────────────────────────────────

  describe('credit', () => {
    it('increases available balance and writes credit ledger entry', async () => {
      const wallet = makeWallet(10000);
      walletRepo.findOne.mockResolvedValue(wallet);
      walletRepo.save.mockResolvedValue({ ...wallet, availableBalance: 15000 });
      ledgerRepo.save.mockResolvedValue({});

      await service.credit('wallet-1', 5000, LedgerAccount.USER_CASH, 'txn-4');

      expect(walletRepo.save).toHaveBeenCalledWith(expect.objectContaining({ availableBalance: 15000 }));
      expect(ledgerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ direction: LedgerDirection.CREDIT, amount: 5000, account: LedgerAccount.USER_CASH }),
      );
    });
  });

  // ── lock / unlock ─────────────────────────────────────────────────────────

  describe('lock', () => {
    it('moves amount from available to locked', async () => {
      const wallet = makeWallet(50000);
      wallet.lockedBalance = 0;
      walletRepo.findOne.mockResolvedValue(wallet);
      walletRepo.save.mockResolvedValue(wallet);

      await service.lock('wallet-1', 10000);

      expect(walletRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ availableBalance: 40000, lockedBalance: 10000 }),
      );
    });

    it('throws when available balance is insufficient', async () => {
      walletRepo.findOne.mockResolvedValue(makeWallet(5000));
      await expect(service.lock('wallet-1', 10000)).rejects.toThrow(BadRequestException);
    });
  });

  describe('unlock', () => {
    it('moves amount from locked back to available', async () => {
      const wallet = { ...makeWallet(0), lockedBalance: 10000 };
      walletRepo.findOne.mockResolvedValue(wallet);
      walletRepo.save.mockResolvedValue(wallet);

      await service.unlock('wallet-1', 10000);

      expect(walletRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ availableBalance: 10000, lockedBalance: 0 }),
      );
    });
  });

  // ── handleDepositWebhook (idempotency) ────────────────────────────────────

  describe('handleDepositWebhook', () => {
    it('is a no-op when intent is already COMPLETED', async () => {
      intentRepo.findOne.mockResolvedValue({ status: PaymentIntentStatus.COMPLETED, id: 'intent-1' });
      await service.handleDepositWebhook('ref-1');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('is a no-op when intent is not found', async () => {
      intentRepo.findOne.mockResolvedValue(null);
      await service.handleDepositWebhook('ref-x');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('credits wallet and marks intent COMPLETED for pending deposit', async () => {
      const intent = { id: 'intent-1', walletId: 'wallet-1', amount: 50000, status: PaymentIntentStatus.PENDING, providerRef: 'ref-1' };
      intentRepo.findOne.mockResolvedValue(intent);

      dataSource.transaction.mockImplementation(async (fn: (em: any) => Promise<void>) => {
        await fn({ getRepository: () => ({ update: jest.fn(), findOne: jest.fn().mockResolvedValue(makeWallet(0)), save: jest.fn(), create: jest.fn((d) => d) }) });
      });

      await service.handleDepositWebhook('ref-1');
      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });
});
