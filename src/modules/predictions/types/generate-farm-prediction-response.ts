import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class GenerateFarmPredictionResponse {
  @Field()
  message: string;
}
