import { ObjectType, Field, Int } from '@nestjs/graphql';
import { PriceType } from '../entities/market-price-point.entity';

@ObjectType()
export class CropPriceSeries {
  @Field()
  cropId: string;

  @Field()
  region: string;

  @Field(() => [PriceDataPoint])
  points: PriceDataPoint[];
}

@ObjectType()
export class PriceDataPoint {
  @Field()
  observedAt: Date;

  @Field(() => Int)
  price: number;

  @Field()
  currency: string;

  @Field(() => PriceType)
  priceType: PriceType;

  @Field({ nullable: true })
  source: string;
}
