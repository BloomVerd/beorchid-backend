import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class InitiatePaymentInput {
  @Field(() => ID)
  @IsUUID()
  planId: string;
}
