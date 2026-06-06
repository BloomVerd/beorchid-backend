import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsUrl, IsUUID } from 'class-validator';

@InputType()
export class InitiatePaymentInput {
  @Field(() => ID)
  @IsUUID()
  planId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  callbackUrl?: string;
}
