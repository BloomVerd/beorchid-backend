import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsOptional, IsNumber, IsArray, IsString, IsInt, Min } from 'class-validator';
import { GrowthStage, SoilType } from '../entities/farm.entity';

@InputType()
export class UpdateFarmSoilDataInput {
  @Field(() => SoilType, { nullable: true })
  @IsOptional()
  soil_type?: SoilType;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  crop_density?: number;

  @Field(() => GrowthStage, { nullable: true })
  @IsOptional()
  growth_stage?: GrowthStage;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  elevation_m?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  days_to_maturity?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  iot_device_ids?: string[];
}
