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

  listCoins(): Promise<Coin[]> {
    return this.coinRepo.find({ order: { name: 'ASC' } });
  }

  async findCoinById(id: string): Promise<Coin> {
    const coin = await this.coinRepo.findOne({ where: { id } });
    if (!coin) throw new NotFoundException(`Coin ${id} not found`);
    return coin;
  }

  async updateCoin(id: string, data: Partial<Coin>): Promise<Coin> {
    await this.coinRepo.update(id, data);
    return this.findCoinById(id);
  }

  recomputePrice(coinId: string): Promise<CoinPricePoint> {
    return this.pricingService.recompute(coinId);
  }

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
