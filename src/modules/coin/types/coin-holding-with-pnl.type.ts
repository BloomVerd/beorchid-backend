import { ObjectType, Field, Int } from '@nestjs/graphql';
import { CoinHolding } from '../entities/coin-holding.entity';
import { Coin } from '../entities/coin.entity';

@ObjectType()
export class CoinHoldingWithPnl {
  @Field(() => CoinHolding)
  holding: CoinHolding;

  @Field(() => Coin)
  coin: Coin;

  @Field(() => Int)
  currentValue: number;

  @Field(() => Int)
  unrealizedPnl: number;
}
