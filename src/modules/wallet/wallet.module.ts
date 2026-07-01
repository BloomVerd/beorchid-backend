import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { PaymentIntentV2 } from './entities/payment-intent-v2.entity';
import { WalletService } from './wallet.service';
import { WalletResolver } from './wallet.resolver';
import { WalletController } from './wallet.controller';
// import { PaymentModule } from '../payment/payment.module';
import { Farmer } from '../farmer/entities/farmer.entity';
import { ConfigModule } from '@nestjs/config';

/**
 * Wallet module — GHS wallet management and Paystack deposit integration.
 *
 * Each user gets a single GHS wallet created lazily via `getOrCreateWallet`.
 * All balance mutations go through double-entry `LedgerEntry` rows (DEBIT /
 * CREDIT) with a `pessimistic_write` lock to prevent race conditions.
 *
 * Deposit flow:
 *  1. Client calls `initiateDeposit` (GraphQL mutation) → Paystack transaction
 *     is initialised; a `PaymentIntentV2` row is created with status PENDING.
 *  2. Paystack POSTs a `charge.success` webhook → `handleDepositWebhook`
 *     credits the wallet and marks the intent COMPLETED (idempotent).
 *
 * Exports WalletService for use by PaymentModule (subscription payments) and
 * CoinModule (coin trade settlements).
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Wallet, LedgerEntry, PaymentIntentV2, Farmer]),
    // PaymentModule,
  ],
  providers: [WalletService, WalletResolver],
  controllers: [WalletController],
  exports: [WalletService],
})
export class WalletModule {}
