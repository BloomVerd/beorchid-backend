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

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class CoinResolver {
  constructor(private readonly coinService: CoinService) {}

  @Query(() => [Coin])
  coins(): Promise<Coin[]> {
    return this.coinService.listCoins();
  }

  @Query(() => Coin)
  coin(@Args('id', { type: () => ID }) id: string): Promise<Coin> {
    return this.coinService.findCoinById(id);
  }

  @Query(() => [CoinPricePoint])
  coinPrices(
    @Args('coinId', { type: () => ID }) coinId: string,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
  ): Promise<CoinPricePoint[]> {
    return this.coinService.getCoinPrices(coinId, from, to);
  }

  @Query(() => [CoinHoldingWithPnl])
  myCoins(@CurrentFarmer() user: Farmer): Promise<CoinHoldingWithPnl[]> {
    return this.coinService.myHoldings(user.id);
  }

  @Mutation(() => Coin)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  createCoin(
    @Args('input') input: CreateCoinInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<Coin> {
    return this.coinService.createCoin(input, user.id);
  }

  @Mutation(() => Coin)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  updateCoinStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => CoinStatus }) status: CoinStatus,
  ): Promise<Coin> {
    return this.coinService.updateCoinStatus(id, status);
  }

  @Mutation(() => CoinPricePoint)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  recomputeCoinPrice(
    @Args('coinId', { type: () => ID }) coinId: string,
  ): Promise<CoinPricePoint> {
    return this.coinService.recomputePrice(coinId);
  }

  @Mutation(() => CoinTransaction)
  buyCoin(
    @Args('coinId', { type: () => ID }) coinId: string,
    @Args('units', { type: () => Number }) units: number,
    @Args('idempotencyKey') idempotencyKey: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<CoinTransaction> {
    return this.coinService.buy(coinId, user.id, units, idempotencyKey);
  }

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
