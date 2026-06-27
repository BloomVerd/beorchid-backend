import { Field, ObjectType } from '@nestjs/graphql';
import { Listing } from '../../marketplace/entities/listing.entity';
import { Coin } from '../../coin/entities/coin.entity';
import { InvestmentPlan } from '../../investment/entities/investment-plan.entity';
import { Crop } from '../../market/entities/crop.entity';

@ObjectType()
export class SearchResults {
  @Field(() => [Listing])
  listings: Listing[];

  @Field(() => [Coin])
  coins: Coin[];

  @Field(() => [InvestmentPlan])
  plans: InvestmentPlan[];

  @Field(() => [Crop])
  crops: Crop[];
}
