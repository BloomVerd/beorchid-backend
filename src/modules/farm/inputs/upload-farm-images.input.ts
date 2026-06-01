import { Field, Float, InputType } from '@nestjs/graphql';
import { IsArray, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';
import { PredictionType } from '../entities/image-data.entity';

@InputType()
export class FarmImageItemInput {
  /** CloudFront URL of the image already uploaded via the pre-signed URL flow */
  @Field()
  @IsUrl()
  url: string;

  @Field(() => Float)
  @IsNumber()
  lat: number;

  @Field(() => Float)
  @IsNumber()
  lon: number;

  @Field(() => [PredictionType])
  @IsArray()
  predictionTypes: PredictionType[];
}

@InputType()
export class UploadFarmImagesInput {
  @Field(() => [FarmImageItemInput])
  @IsArray()
  images: FarmImageItemInput[];

  /**
   * Optional: associate these images with a specific PredictionRange.
   * When omitted the images are "unscheduled" — still available to the
   * LLM pipeline but not tied to a weekly batch.
   */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  predictionRangeId?: string;
}
