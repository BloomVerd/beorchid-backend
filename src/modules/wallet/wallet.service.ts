import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Wallet, WalletOwnerType } from './entities/wallet.entity';
import { LedgerEntry, LedgerDirection, LedgerAccount } from './entities/ledger-entry.entity';
import {
  PaymentIntentV2,
  PaymentIntentType,
  PaymentIntentStatus,
} from './entities/payment-intent-v2.entity';
import { PaymentService } from '../payment/payment.service';
import { Farmer } from '../farmer/entities/farmer.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(PaymentIntentV2)
    private readonly intentRepo: Repository<PaymentIntentV2>,
    @InjectRepository(Farmer)
    private readonly farmerRepo: Repository<Farmer>,
    private readonly dataSource: DataSource,
    private readonly paymentService: PaymentService,
  ) {}

  async getOrCreateWallet(ownerId: string, ownerType = WalletOwnerType.USER): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { ownerId, ownerType } });
    if (!wallet) {
      wallet = await this.walletRepo.save(
        this.walletRepo.create({ ownerId, ownerType, currency: 'GHS' }),
      );
    }
    return wallet;
  }

  async getLedger(walletId: string, from?: Date, to?: Date, account?: LedgerAccount): Promise<LedgerEntry[]> {
    const where: any = { walletId };
    if (account) where.account = account;
    return this.ledgerRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async debit(
    walletId: string,
    amount: number,
    account: LedgerAccount,
    transactionId: string,
    em?: any,
  ): Promise<void> {
    const repo = em ? em.getRepository(Wallet) : this.walletRepo;
    const ledgerRepo = em ? em.getRepository(LedgerEntry) : this.ledgerRepo;

    const wallet = await repo.findOne({ where: { id: walletId }, lock: { mode: 'pessimistic_write' } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.availableBalance < amount) throw new BadRequestException('Insufficient balance');

    wallet.availableBalance = Number(wallet.availableBalance) - amount;
    await repo.save(wallet);
    await ledgerRepo.save(ledgerRepo.create({ transactionId, walletId, direction: LedgerDirection.DEBIT, amount, account }));
  }

  async credit(
    walletId: string,
    amount: number,
    account: LedgerAccount,
    transactionId: string,
    em?: any,
  ): Promise<void> {
    const repo = em ? em.getRepository(Wallet) : this.walletRepo;
    const ledgerRepo = em ? em.getRepository(LedgerEntry) : this.ledgerRepo;

    const wallet = await repo.findOne({ where: { id: walletId }, lock: { mode: 'pessimistic_write' } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    wallet.availableBalance = Number(wallet.availableBalance) + amount;
    await repo.save(wallet);
    await ledgerRepo.save(ledgerRepo.create({ transactionId, walletId, direction: LedgerDirection.CREDIT, amount, account }));
  }

  async lock(walletId: string, amount: number, em?: any): Promise<void> {
    const repo = em ? em.getRepository(Wallet) : this.walletRepo;
    const wallet = await repo.findOne({ where: { id: walletId }, lock: { mode: 'pessimistic_write' } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.availableBalance < amount) throw new BadRequestException('Insufficient balance');
    wallet.availableBalance = Number(wallet.availableBalance) - amount;
    wallet.lockedBalance = Number(wallet.lockedBalance) + amount;
    await repo.save(wallet);
  }

  async unlock(walletId: string, amount: number, em?: any): Promise<void> {
    const repo = em ? em.getRepository(Wallet) : this.walletRepo;
    const wallet = await repo.findOne({ where: { id: walletId }, lock: { mode: 'pessimistic_write' } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    wallet.lockedBalance = Math.max(0, Number(wallet.lockedBalance) - amount);
    wallet.availableBalance = Number(wallet.availableBalance) + amount;
    await repo.save(wallet);
  }

  async initiateDeposit(userId: string, amountPesewas: number, idempotencyKey: string): Promise<{ intent: PaymentIntentV2; checkoutUrl: string }> {
    const existing = await this.intentRepo.findOne({ where: { idempotencyKey } });
    if (existing) return { intent: existing, checkoutUrl: existing.checkoutUrl ?? '' };

    const wallet = await this.getOrCreateWallet(userId);
    const farmer = await this.farmerRepo.findOne({ where: { id: userId } });
    if (!farmer) throw new NotFoundException('User not found');

    const reference = `dep_${crypto.randomBytes(8).toString('hex')}`;
    const { authorizationUrl } = await this.paymentService.initializeTransaction(
      farmer.email,
      amountPesewas,
      reference,
      { walletId: wallet.id, userId },
    );

    const intent = await this.intentRepo.save(
      this.intentRepo.create({
        walletId: wallet.id,
        type: PaymentIntentType.DEPOSIT,
        amount: amountPesewas,
        status: PaymentIntentStatus.PENDING,
        idempotencyKey,
        providerRef: reference,
        checkoutUrl: authorizationUrl,
      }),
    );

    return { intent, checkoutUrl: authorizationUrl };
  }

  async handleDepositWebhook(providerRef: string): Promise<void> {
    const intent = await this.intentRepo.findOne({ where: { providerRef } });
    if (!intent || intent.status === PaymentIntentStatus.COMPLETED) return; // idempotent

    const txnId = crypto.randomUUID();
    await this.dataSource.transaction(async (em) => {
      await this.credit(intent.walletId, intent.amount, LedgerAccount.USER_CASH, txnId, em);
      await em.getRepository(PaymentIntentV2).update(intent.id, { status: PaymentIntentStatus.COMPLETED });
    });
  }
}
