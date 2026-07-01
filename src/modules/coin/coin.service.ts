import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import * as crypto from 'crypto';
import { Coin, CoinStatus } from './entities/coin.entity';
import { CoinPricePoint } from './entities/coin-price-point.entity';
import { CoinHolding } from './entities/coin-holding.entity';
import { CoinTransaction, CoinSide } from './entities/coin-transaction.entity';
import { CreateCoinInput } from './inputs/create-coin.input';
import { CoinPricingService } from './coin-pricing.service';
import { WalletService } from '../wallet/wallet.service';
import { LedgerAccount } from '../wallet/entities/ledger-entry.entity';
import { CoinHoldingWithPnl } from './types/coin-holding-with-pnl.type';

/**
 * Service for crop-backed digital coin trading and position management.
 *
 * Trading flow:
 *  1. Admin creates a coin (DRAFT) and activates it (`updateCoinStatus → ACTIVE`).
 *  2. Investors call `buy` — wallet is debited into `COIN_POOL`; holding is
 *     created/updated using VWAP average-cost tracking.
 *  3. Investors call `sell` — holding is decremented; wallet is credited
 *     `USER_CASH` at the current coin price.
 *  4. `recomputePrice` delegates to `CoinPricingService` and persists a new
 *     `CoinPricePoint`. This is also triggered automatically via the
 *     `coin-price-recompute` BullMQ queue whenever market prices change.
 *
 * All buy/sell operations run inside a TypeORM transaction with pessimistic
 * write locks on the `Coin` row to prevent race conditions on
 * `circulatingSupply`.
 */
@Injectable()
export class CoinService {
  constructor(
    @InjectRepository(Coin) private readonly coinRepo: Repository<Coin>,
    @InjectRepository(CoinPricePoint)
    private readonly pointRepo: Repository<CoinPricePoint>,
    @InjectRepository(CoinHolding)
    private readonly holdingRepo: Repository<CoinHolding>,
    @InjectRepository(CoinTransaction)
    private readonly txnRepo: Repository<CoinTransaction>,
    private readonly dataSource: DataSource,
    private readonly pricingService: CoinPricingService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Creates a new coin in DRAFT status with default pricing weights if none
   * are provided. The coin must be activated via `updateCoinStatus` before
   * trading is possible.
   */
  async createCoin(input: CreateCoinInput, createdBy: string): Promise<Coin> {
    const coin = this.coinRepo.create({
      ...input,
      currentPrice: input.basePrice,
      pricingWeights: input.pricingWeights ?? {
        w_trend: 0.3,
        w_demand: 0.2,
        w_health: 0.3,
        w_vol: 0.2,
      },
      createdBy,
      status: CoinStatus.DRAFT,
    });
    return this.coinRepo.save(coin);
  }

  /** Returns all coins ordered by name ascending. */
  listCoins(): Promise<Coin[]> {
    return this.coinRepo.find({ order: { name: 'ASC' } });
  }

  /**
   * Returns a single coin by ID.
   *
   * @throws NotFoundException if the coin does not exist
   */
  async findCoinById(id: string): Promise<Coin> {
    const coin = await this.coinRepo.findOne({ where: { id } });
    if (!coin) throw new NotFoundException(`Coin ${id} not found`);
    return coin;
  }

  /** Applies a partial update to a coin and returns the updated record. */
  async updateCoin(id: string, data: Partial<Coin>): Promise<Coin> {
    await this.coinRepo.update(id, data);
    return this.findCoinById(id);
  }

  /**
   * Transitions a coin to a new status (DRAFT → ACTIVE → DELISTED).
   * Trading requires ACTIVE status; `sell` also works on DELISTED coins.
   */
  async updateCoinStatus(id: string, status: CoinStatus): Promise<Coin> {
    return this.updateCoin(id, { status });
  }

  /** Delegates to `CoinPricingService.recompute` and returns the new price point. */
  recomputePrice(coinId: string): Promise<CoinPricePoint> {
    return this.pricingService.recompute(coinId);
  }

  /**
   * Returns price history for a coin with optional date range filtering.
   * Results are ordered by `computedAt` ascending.
   */
  getCoinPrices(
    coinId: string,
    from?: Date,
    to?: Date,
  ): Promise<CoinPricePoint[]> {
    const where: any = { coinId };
    if (from && to) where.computedAt = Between(from, to);
    else if (from) where.computedAt = MoreThanOrEqual(from);
    else if (to) where.computedAt = LessThanOrEqual(to);
    return this.pointRepo.find({ where, order: { computedAt: 'ASC' } });
  }

  /**
   * Executes a coin purchase inside a transaction:
   *  1. Locks the `Coin` row for write.
   *  2. Debits `grossAmount` (units × currentPrice) from the user's wallet
   *     into `COIN_POOL`.
   *  3. Creates or updates the `CoinHolding` using VWAP average-cost blending.
   *  4. Increments `coin.circulatingSupply`.
   *  5. Records a `CoinTransaction` (BUY side).
   *
   * @throws NotFoundException   if the coin does not exist
   * @throws BadRequestException if the coin is not ACTIVE
   */
  async buy(
    coinId: string,
    userId: string,
    units: number,
    idempotencyKey: string,
  ): Promise<CoinTransaction> {
    return this.dataSource.transaction(async (em) => {
      const coinRepo = em.getRepository(Coin);
      const holdingRepo = em.getRepository(CoinHolding);
      const txnRepo = em.getRepository(CoinTransaction);

      const coin = await coinRepo.findOne({
        where: { id: coinId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!coin) throw new NotFoundException('Coin not found');
      if (coin.status !== CoinStatus.ACTIVE)
        throw new BadRequestException('Coin is not active');

      const unitPrice = coin.currentPrice;
      const grossAmount = Math.round(units * unitPrice);

      const wallet = await this.walletService.getOrCreateWallet(userId);
      const txnId = crypto.randomUUID();
      await this.walletService.debit(
        wallet.id,
        grossAmount,
        LedgerAccount.COIN_POOL,
        txnId,
        em,
      );

      let holding = await holdingRepo.findOne({ where: { userId, coinId } });
      if (holding) {
        const totalCost =
          Number(holding.avgCost) * Number(holding.units) + grossAmount;
        const totalUnits = Number(holding.units) + units;
        holding.units = totalUnits;
        holding.avgCost = Math.round(totalCost / totalUnits);
      } else {
        holding = holdingRepo.create({
          userId,
          coinId,
          units,
          avgCost: unitPrice,
        });
      }
      await holdingRepo.save(holding);

      coin.circulatingSupply = Number(coin.circulatingSupply) + units;
      await coinRepo.save(coin);

      return txnRepo.save(
        txnRepo.create({
          userId,
          coinId,
          side: CoinSide.BUY,
          units,
          unitPrice,
          grossAmount,
          fee: 0,
          ledgerRef: txnId,
        }),
      );
    });
  }

  /**
   * Executes a coin sale inside a transaction:
   *  1. Locks the `Coin` row and `CoinHolding` row for write.
   *  2. Verifies the user holds sufficient units.
   *  3. Credits `grossAmount` (units × currentPrice) to the user's wallet
   *     as `USER_CASH`.
   *  4. Decrements the holding and `coin.circulatingSupply`.
   *  5. Records a `CoinTransaction` (SELL side).
   *
   * @throws NotFoundException   if the coin does not exist
   * @throws BadRequestException if the coin is DELISTED or holdings are insufficient
   */
  async sell(
    coinId: string,
    userId: string,
    units: number,
    idempotencyKey: string,
  ): Promise<CoinTransaction> {
    return this.dataSource.transaction(async (em) => {
      const coinRepo = em.getRepository(Coin);
      const holdingRepo = em.getRepository(CoinHolding);
      const txnRepo = em.getRepository(CoinTransaction);

      const coin = await coinRepo.findOne({
        where: { id: coinId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!coin) throw new NotFoundException('Coin not found');
      if (coin.status === CoinStatus.DELISTED)
        throw new BadRequestException('Coin is delisted');

      const holding = await holdingRepo.findOne({
        where: { userId, coinId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!holding || Number(holding.units) < units)
        throw new BadRequestException('Insufficient coin holdings');

      const unitPrice = coin.currentPrice;
      const grossAmount = Math.round(units * unitPrice);

      const wallet = await this.walletService.getOrCreateWallet(userId);
      const txnId = crypto.randomUUID();
      await this.walletService.credit(
        wallet.id,
        grossAmount,
        LedgerAccount.USER_CASH,
        txnId,
        em,
      );

      holding.units = Number(holding.units) - units;
      await holdingRepo.save(holding);

      coin.circulatingSupply = Math.max(
        0,
        Number(coin.circulatingSupply) - units,
      );
      await coinRepo.save(coin);

      return txnRepo.save(
        txnRepo.create({
          userId,
          coinId,
          side: CoinSide.SELL,
          units,
          unitPrice,
          grossAmount,
          fee: 0,
          ledgerRef: txnId,
        }),
      );
    });
  }

  /**
   * Returns all coin holdings for a user enriched with current market value
   * and unrealised P&L (`currentValue - costBasis`).
   */
  async myHoldings(userId: string): Promise<CoinHoldingWithPnl[]> {
    const holdings = await this.holdingRepo.find({ where: { userId } });
    const results: CoinHoldingWithPnl[] = [];
    for (const holding of holdings) {
      const coin = await this.findCoinById(holding.coinId);
      const currentValue = Math.round(
        Number(holding.units) * coin.currentPrice,
      );
      const cost = Math.round(Number(holding.units) * Number(holding.avgCost));
      results.push({
        holding,
        coin,
        currentValue,
        unrealizedPnl: currentValue - cost,
      });
    }
    return results;
  }
}
