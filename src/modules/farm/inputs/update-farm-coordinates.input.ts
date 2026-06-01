import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsNumber, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class CoordinatePointInput {
  @Field(() => Int)
  @IsNumber()
  order: number;

  @Field(() => Float)
  @IsNumber()
  lat: number;

  @Field(() => Float)
  @IsNumber()
  lon: number;
}

@InputType()
export class UpdateFarmCoordinatesInput {
  @Field(() => [CoordinatePointInput])
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CoordinatePointInput)
  coordinates: CoordinatePointInput[];
}
