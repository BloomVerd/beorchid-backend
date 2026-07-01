import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CoinService } from './coin.service';
import { Coin, CoinStatus } from './entities/coin.entity';
import { CoinPricePoint } from './entities/coin-price-point.entity';
import { CoinTransaction } from './entities/coin-transaction.entity';
import { CreateCoinInput } from './inputs/create-coin.input';
import { CoinHoldingWithPnl } from './types/coin-holding-with-pnl.type';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for the coin module. All operations require a valid JWT
 * (`GqlJwtAuthGuard` applied at the class level). Admin-only mutations
 * (`createCoin`, `updateCoinStatus`, `recomputeCoinPrice`) additionally
 * require the `super_admin` role. Trading mutations (`buyCoin`, `sellCoin`)
 * are open to all authenticated users.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class CoinResolver {
  constructor(private readonly coinService: CoinService) {}

  /** Returns all coins ordered by name. Available to all authenticated users. */
  @Query(() => [Coin])
  coins(): Promise<Coin[]> {
    return this.coinService.listCoins();
  }

  /** Returns a single coin by ID. Available to all authenticated users. */
  @Query(() => Coin)
  coin(@Args('id', { type: () => ID }) id: string): Promise<Coin> {
    return this.coinService.findCoinById(id);
  }

  /**
   * Returns price history for a coin with optional date range filtering.
   * Available to all authenticated users.
   */
  @Query(() => [CoinPricePoint])
  coinPrices(
    @Args('coinId', { type: () => ID }) coinId: string,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
  ): Promise<CoinPricePoint[]> {
    return this.coinService.getCoinPrices(coinId, from, to);
  }

  /**
   * Returns the authenticated user's coin holdings enriched with current
   * market value and unrealised P&L.
   */
  @Query(() => [CoinHoldingWithPnl])
  myCoins(@CurrentFarmer() user: Farmer): Promise<CoinHoldingWithPnl[]> {
    return this.coinService.myHoldings(user.id);
  }

  /** Creates a new coin in DRAFT status. Restricted to `super_admin`. */
  @Mutation(() => Coin)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  createCoin(
    @Args('input') input: CreateCoinInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<Coin> {
    return this.coinService.createCoin(input, user.id);
  }

  /**
   * Transitions a coin to a new status (e.g. DRAFT → ACTIVE → DELISTED).
   * Restricted to `super_admin`.
   */
  @Mutation(() => Coin)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  updateCoinStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => CoinStatus }) status: CoinStatus,
  ): Promise<Coin> {
    return this.coinService.updateCoinStatus(id, status);
  }

  /**
   * Manually triggers price recomputation for a coin, persisting a new
   * `CoinPricePoint`. Restricted to `super_admin`.
   */
  @Mutation(() => CoinPricePoint)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  recomputeCoinPrice(
    @Args('coinId', { type: () => ID }) coinId: string,
  ): Promise<CoinPricePoint> {
    return this.coinService.recomputePrice(coinId);
  }

  /**
   * Purchases coin units for the authenticated user. Debits the wallet into
   * `COIN_POOL` and updates the VWAP holding. Requires an `idempotencyKey`
   * to prevent duplicate submissions.
   */
  @Mutation(() => CoinTransaction)
  buyCoin(
    @Args('coinId', { type: () => ID }) coinId: string,
    @Args('units', { type: () => Number }) units: number,
    @Args('idempotencyKey') idempotencyKey: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<CoinTransaction> {
    return this.coinService.buy(coinId, user.id, units, idempotencyKey);
  }

  /**
   * Sells coin units for the authenticated user. Credits the wallet as
   * `USER_CASH` at the current coin price and decrements the holding.
   * Requires an `idempotencyKey` to prevent duplicate submissions.
   */
  @Mutation(() => CoinTransaction)
  sellCoin(
    @Args('coinId', { type: () => ID }) coinId: string,
    @Args('units', { type: () => Number }) units: number,
    @Args('idempotencyKey') idempotencyKey: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<CoinTransaction> {
    return this.coinService.sell(coinId, user.id, units, idempotencyKey);
  }
}
