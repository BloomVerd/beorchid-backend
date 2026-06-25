import { InputType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PriceType } from '../../market/entities/market-price-point.entity';

@InputType()
export class InjectPricePointInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cropId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cropSlug?: string;

  @Field()
  @IsString()
  region: string;

  @Field()
  @IsISO8601()
  observedAt: string;

  @Field(() => Int)
  priceInPesewas: number;

  @Field({ defaultValue: 'GHS' })
  @IsString()
  currency: string;

  @Field(() => PriceType)
  @IsEnum(PriceType)
  priceType: PriceType;

  @Field()
  @IsString()
  source: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  volumeKg?: number;

  @Field({ nullable: true })
  @IsOptional()
  qualityGrade?: string;

  @Field({ nullable: true })
  @IsOptional()
  notes?: string;
}
