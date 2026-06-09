import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

@InputType()
export class UpdateFarmerSettingsInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(604800)
  farmDataLookbackSeconds?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  farmDataCacheTtlSeconds?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  healthReportIntervalSeconds?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  predictionWeeklyLimit?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  notifyInApp?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  notifyEmail?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  notifySms?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  smsPhoneNumber?: string;
}
