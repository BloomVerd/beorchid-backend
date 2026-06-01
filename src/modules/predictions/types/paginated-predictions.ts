import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Prediction } from '../entities/prediction.entity';

@ObjectType()
export class PaginatedPredictions {
  @Field(() => [Prediction])
  data: Prediction[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  lastPage: number;
}
