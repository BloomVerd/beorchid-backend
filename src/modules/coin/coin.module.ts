import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Coin } from './entities/coin.entity';
import { CoinPricePoint } from './entities/coin-price-point.entity';
import { CoinHolding } from './entities/coin-holding.entity';
import { CoinTransaction } from './entities/coin-transaction.entity';
import { CoinService } from './coin.service';
import { CoinResolver } from './coin.resolver';
import { CoinPricingService } from './coin-pricing.service';
import { CoinRecomputeConsumer } from './coin-recompute.consumer';
import { MarketModule } from '../market/market.module';
import { WalletModule } from '../wallet/wallet.module';

/**
 * Coin module — crop-backed digital coins with dynamic market-driven pricing.
 *
 * Provides buy/sell trading for investors, VWAP position tracking with
 * unrealised P&L, and an automated price recomputation pipeline triggered by
 * the `coin-price-recompute` BullMQ queue. Depends on MarketModule for crop
 * price history used in the pricing formula, and WalletModule for debit/credit
 * operations on trade execution.
 *
 * Exports CoinService and CoinPricingService for use by other modules.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Coin, CoinPricePoint, CoinHolding, CoinTransaction]),
    BullModule.registerQueue({ name: 'coin-price-recompute' }),
    MarketModule,
    WalletModule,
  ],
  providers: [CoinService, CoinResolver, CoinPricingService, CoinRecomputeConsumer],
  exports: [CoinService, CoinPricingService],
})
export class CoinModule {}
