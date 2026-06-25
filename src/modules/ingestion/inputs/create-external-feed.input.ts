import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FeedFormat } from '../entities/external-feed.entity';

@InputType()
export class CreateExternalFeedInput {
  @Field()
  @IsString()
  name: string;

  @Field()
  @IsString()
  url: string;

  @Field(() => FeedFormat)
  @IsEnum(FeedFormat)
  format: FeedFormat;

  @Field(() => Object)
  fieldMap: Record<string, string>;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cropId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  region?: string;

  @Field()
  @IsString()
  priceType: string;

  @Field()
  @IsString()
  sourceLabel: string;

  @Field()
  @IsString()
  scheduleCron: string;
}
