import { InputType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { FieldPriceType, ObservationConfidence, QualityGrade } from '../entities/field-observation.entity';

@InputType()
export class SubmitObservationInput {
  @Field()
  @IsUUID()
  cropId: string;

  @Field()
  @IsString()
  region: string;

  @Field()
  @IsISO8601()
  observedAt: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  observedPrice: number;

  @Field(() => FieldPriceType)
  @IsEnum(FieldPriceType)
  priceType: FieldPriceType;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  quantityAvailable?: number;

  @Field(() => QualityGrade, { nullable: true })
  @IsOptional()
  @IsEnum(QualityGrade)
  qualityGrade?: QualityGrade;

  @Field()
  @IsString()
  sourceNote: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  agentDeviceId?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  attachmentUrls?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  conditionTags?: string[];

  @Field(() => ObservationConfidence)
  @IsEnum(ObservationConfidence)
  confidence: ObservationConfidence;
}
