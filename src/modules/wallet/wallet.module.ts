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

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, LedgerEntry, PaymentIntentV2, Farmer]),
    // PaymentModule,
  ],
  providers: [WalletService, WalletResolver],
  controllers: [WalletController],
  exports: [WalletService],
})
export class WalletModule {}
