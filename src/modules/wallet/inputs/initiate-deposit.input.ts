import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsString, Min } from 'class-validator';

@InputType()
export class InitiateDepositInput {
  @Field(() => Int)
  @IsInt()
  @Min(100)
  amountPesewas: number;

  @Field()
  @IsString()
  idempotencyKey: string;
}
