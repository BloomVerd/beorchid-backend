import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Wallet, WalletOwnerType } from './entities/wallet.entity';
import {
  LedgerEntry,
  LedgerDirection,
  LedgerAccount,
} from './entities/ledger-entry.entity';
import {
  PaymentIntentV2,
  PaymentIntentType,
  PaymentIntentStatus,
} from './entities/payment-intent-v2.entity';
import {
  // PaymentService,
  PaystackInitResponse,
} from '../payment/payment.service';
import { Farmer } from '../farmer/entities/farmer.entity';
import { ConfigService } from '@nestjs/config';

/**
 * Core wallet and ledger service for GHS balance management.
 *
 * Balance model:
 *  - `availableBalance` — funds the user can spend immediately.
 *  - `lockedBalance` — funds reserved for pending operations (e.g. escrow).
 *  Every balance change writes a matching `LedgerEntry` row so the full
 *  transaction history is auditable.
 *
 * All mutating methods accept an optional `em` (EntityManager) so they can
 * participate in an outer transaction. When called without `em`, they open
 * their own transaction internally.
 *
 * Deposit flow:
 *  1. `initiateDeposit` — creates a Paystack transaction and a `PaymentIntentV2`
 *     row (status PENDING). Returns the Paystack checkout URL.
 *  2. `handleDepositWebhook` — called by the webhook controller on
 *     `charge.success`; credits the wallet and marks the intent COMPLETED.
 *     Idempotent: second calls with the same `providerRef` are no-ops.
 */
@Injectable()
export class WalletService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

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
    // private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') ?? '';
  }

  /**
   * Returns the wallet for `ownerId`, creating it (currency: GHS) if it does
   * not yet exist.
   */
  async getOrCreateWallet(
    ownerId: string,
    ownerType = WalletOwnerType.USER,
  ): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({
      where: { ownerId, ownerType },
    });
    if (!wallet) {
      wallet = await this.walletRepo.save(
        this.walletRepo.create({ ownerId, ownerType, currency: 'GHS' }),
      );
    }
    return wallet;
  }

  /** Returns ledger entries for a wallet with optional date-range and account filters. */
  async getLedger(
    walletId: string,
    from?: Date,
    to?: Date,
    account?: LedgerAccount,
  ): Promise<LedgerEntry[]> {
    const where: any = { walletId };
    if (account) where.account = account;
    return this.ledgerRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Debits `amount` from `availableBalance` and writes a DEBIT ledger entry.
   * Uses a `pessimistic_write` lock to prevent concurrent over-spend.
   * Wraps itself in a transaction if no `em` is provided.
   *
   * @throws NotFoundException   if the wallet does not exist
   * @throws BadRequestException if the balance is insufficient
   */
  async debit(
    walletId: string,
    amount: number,
    account: LedgerAccount,
    transactionId: string,
    em?: any,
  ): Promise<void> {
    if (!em) {
      return this.dataSource.transaction((txEm) =>
        this.debit(walletId, amount, account, transactionId, txEm),
      );
    }
    const repo = em.getRepository(Wallet);
    const ledgerRepo = em.getRepository(LedgerEntry);

    const wallet = await repo.findOne({
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (Number(wallet.availableBalance) < Number(amount))
      throw new BadRequestException('Insufficient balance');

    wallet.availableBalance = Number(wallet.availableBalance) - Number(amount);
    await repo.save(wallet);
    await ledgerRepo.save(
      ledgerRepo.create({
        transactionId,
        walletId,
        direction: LedgerDirection.DEBIT,
        amount,
        account,
      }),
    );
  }

  /**
   * Credits `amount` to `availableBalance` and writes a CREDIT ledger entry.
   * Wraps itself in a transaction if no `em` is provided.
   *
   * @throws NotFoundException if the wallet does not exist
   */
  async credit(
    walletId: string,
    amount: number,
    account: LedgerAccount,
    transactionId: string,
    em?: any,
  ): Promise<void> {
    if (!em) {
      return this.dataSource.transaction((txEm) =>
        this.credit(walletId, amount, account, transactionId, txEm),
      );
    }
    const repo = em.getRepository(Wallet);
    const ledgerRepo = em.getRepository(LedgerEntry);

    const wallet = await repo.findOne({
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    wallet.availableBalance = Number(wallet.availableBalance) + Number(amount);
    await repo.save(wallet);
    await ledgerRepo.save(
      ledgerRepo.create({
        transactionId,
        walletId,
        direction: LedgerDirection.CREDIT,
        amount,
        account,
      }),
    );
  }

  /**
   * Moves `amount` from `availableBalance` into `lockedBalance` (e.g. escrow).
   *
   * @throws NotFoundException   if the wallet does not exist
   * @throws BadRequestException if the available balance is insufficient
   */
  async lock(walletId: string, amount: number, em?: any): Promise<void> {
    const repo = em ? em.getRepository(Wallet) : this.walletRepo;
    const wallet = await repo.findOne({
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (Number(wallet.availableBalance) < Number(amount))
      throw new BadRequestException('Insufficient balance');
    wallet.availableBalance = Number(wallet.availableBalance) - Number(amount);
    wallet.lockedBalance = Number(wallet.lockedBalance) + Number(amount);
    await repo.save(wallet);
  }

  /**
   * Moves `amount` from `lockedBalance` back to `availableBalance`.
   *
   * @throws NotFoundException if the wallet does not exist
   */
  async unlock(walletId: string, amount: number, em?: any): Promise<void> {
    const repo = em ? em.getRepository(Wallet) : this.walletRepo;
    const wallet = await repo.findOne({
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    wallet.lockedBalance = Math.max(0, Number(wallet.lockedBalance) - Number(amount));
    wallet.availableBalance = Number(wallet.availableBalance) + Number(amount);
    await repo.save(wallet);
  }

  /**
   * Calls the Paystack `/transaction/initialize` API and returns the
   * checkout URL and access code.
   *
   * @throws InternalServerErrorException if the Paystack API returns an error
   */
  async initializeTransaction(
    email: string,
    amount: number,
    reference: string,
    metadata: Record<string, unknown> = {},
    callbackUrl?: string,
  ): Promise<{ authorizationUrl: string; accessCode: string }> {
    const body: Record<string, unknown> = {
      email,
      amount,
      reference,
      metadata,
    };
    if (callbackUrl) body.callback_url = callbackUrl;

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Paystack initialization failed: ${body}`,
      );
    }

    const result = (await response.json()) as PaystackInitResponse;
    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
    };
  }

  /**
   * Initiates a wallet deposit via Paystack. Idempotent on `idempotencyKey` —
   * returns the existing intent and checkout URL if one already exists.
   *
   * @throws NotFoundException if the user's farmer record is not found
   */
  async initiateDeposit(
    userId: string,
    amountPesewas: number,
    idempotencyKey: string,
  ): Promise<{ intent: PaymentIntentV2; checkoutUrl: string }> {
    const existing = await this.intentRepo.findOne({
      where: { idempotencyKey },
    });
    if (existing)
      return { intent: existing, checkoutUrl: existing.checkoutUrl ?? '' };

    const wallet = await this.getOrCreateWallet(userId);
    const farmer = await this.farmerRepo.findOne({ where: { id: userId } });
    if (!farmer) throw new NotFoundException('User not found');

    const reference = `dep_${crypto.randomBytes(8).toString('hex')}`;
    const { authorizationUrl } = await this.initializeTransaction(
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

  /**
   * Handles a Paystack `charge.success` webhook for a deposit. Credits the
   * wallet and marks the `PaymentIntentV2` as COMPLETED. Idempotent — silently
   * returns if the intent is already COMPLETED or not found.
   */
  async handleDepositWebhook(providerRef: string): Promise<void> {
    const intent = await this.intentRepo.findOne({ where: { providerRef } });
    if (!intent || intent.status === PaymentIntentStatus.COMPLETED) return; // idempotent

    const txnId = crypto.randomUUID();
    await this.dataSource.transaction(async (em) => {
      await this.credit(
        intent.walletId,
        intent.amount,
        LedgerAccount.USER_CASH,
        txnId,
        em,
      );
      await em
        .getRepository(PaymentIntentV2)
        .update(intent.id, { status: PaymentIntentStatus.COMPLETED });
    });
  }
}
