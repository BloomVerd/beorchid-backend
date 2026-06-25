import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsString, Min } from 'class-validator';

@InputType()
export class PublishForecastInput {
  @Field()
  @IsString()
  cropId: string;

  @Field()
  @IsString()
  region: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  horizonDays: number;

  @Field(() => Int)
  @IsInt()
  predictedPrice: number;

  @Field(() => Int)
  @IsInt()
  confidenceLow: number;

  @Field(() => Int)
  @IsInt()
  confidenceHigh: number;

  @Field()
  @IsString()
  modelVersion: string;
}
