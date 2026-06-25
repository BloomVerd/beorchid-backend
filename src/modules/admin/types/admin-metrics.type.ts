import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class AdminMetrics {
  @Field(() => Int)
  gmv: number;

  @Field(() => Int)
  aum: number;

  @Field(() => Int)
  coinVolume: number;

  @Field(() => Int)
  activeInvestments: number;

  @Field(() => Int)
  totalListings: number;

  @Field(() => Int)
  totalDeals: number;

  @Field(() => Int)
  totalUsers: number;
}
