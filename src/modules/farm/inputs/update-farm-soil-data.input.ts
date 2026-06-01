import { Field, Float, InputType } from '@nestjs/graphql';
import { IsOptional, IsNumber, IsArray, IsString } from 'class-validator';
import { SoilType } from '../entities/farm.entity';

@InputType()
export class UpdateFarmSoilDataInput {
  @Field(() => SoilType, { nullable: true })
  @IsOptional()
  soil_type?: SoilType;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  crop_density?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  iot_device_ids?: string[];
}
