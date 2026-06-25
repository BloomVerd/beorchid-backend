import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

@InputType()
export class CreateListingInput {
  @Field()
  @IsUUID()
  farmId: string;

  @Field()
  @IsString()
  crop: string;

  @Field(() => Number)
  acreage: number;

  @Field()
  @IsString()
  region: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  askingPrice: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;
}
