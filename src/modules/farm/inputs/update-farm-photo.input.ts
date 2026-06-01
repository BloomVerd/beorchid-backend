import { Field, Float, InputType } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber } from 'class-validator';

@InputType()
export class UpdateFarmPhotoInput {
  @Field()
  @IsString()
  url: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  lon?: number;
}
