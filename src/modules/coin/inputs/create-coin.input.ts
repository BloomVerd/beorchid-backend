import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

@InputType()
export class CreateCoinInput {
  @Field()
  @IsString()
  name: string;

  @Field()
  @IsString()
  symbol: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cropId?: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  basePrice: number;

  @Field(() => Object, { nullable: true })
  @IsOptional()
  pricingWeights?: Record<string, number>;
}
