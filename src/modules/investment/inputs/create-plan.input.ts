import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

@InputType()
export class CreatePlanInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cropId?: string;

  @Field()
  @IsString()
  title: string;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  acreage?: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  unitCost: number;

  @Field(() => Int)
  @IsInt()
  expectedProfitMin: number;

  @Field(() => Int)
  @IsInt()
  expectedProfitMax: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  maturityDays: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  totalUnits: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  riskNotes?: string;
}
