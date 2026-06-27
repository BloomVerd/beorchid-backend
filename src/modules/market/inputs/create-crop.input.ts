import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

@InputType()
export class CreateCropInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  slug?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  unit?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  category?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  region?: string;
}
