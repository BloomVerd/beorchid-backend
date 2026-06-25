import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InsightType } from '../entities/market-survey-insight.entity';

@InputType()
export class PublishInsightInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cropId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  region?: string;

  @Field(() => InsightType)
  @IsEnum(InsightType)
  type: InsightType;

  @Field(() => Object)
  payload: Record<string, unknown>;
}
