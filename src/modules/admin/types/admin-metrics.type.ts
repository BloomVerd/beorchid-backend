import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

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

  @Field(() => Float, { nullable: true })
  gmvDelta: number | null;

  @Field(() => Float, { nullable: true })
  aumDelta: number | null;

  @Field(() => Float, { nullable: true })
  coinVolumeDelta: number | null;

  @Field(() => Float, { nullable: true })
  activeInvestmentsDelta: number | null;

  @Field(() => Float, { nullable: true })
  totalListingsDelta: number | null;

  @Field(() => Float, { nullable: true })
  totalDealsDelta: number | null;

  @Field(() => Float, { nullable: true })
  totalUsersDelta: number | null;
}
