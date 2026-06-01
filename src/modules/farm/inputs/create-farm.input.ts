import { Field, Float, InputType } from '@nestjs/graphql';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { CropType, FarmType } from '../entities/farm.entity';

@InputType()
export class CreateFarmInput {
  @Field()
  @IsString()
  name: string;

  @Field(() => CropType)
  crop_type: CropType;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  variety?: string;

  @Field(() => Float)
  @IsNumber()
  @IsPositive()
  farm_size: number;

  @Field(() => FarmType)
  farm_type: FarmType;
}
