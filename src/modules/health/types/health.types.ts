import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { CropType } from '../../farm/entities/farm.entity';
import { FarmHealth } from '../entities/farm-health.entity';
import { HealthAlert } from '../entities/health-alert.entity';

@ObjectType()
export class FarmHealthSummary {
  @Field()
  farmId: string;

  @Field()
  farmName: string;

  @Field(() => CropType)
  cropType: CropType;

  @Field(() => Float)
  area: number;

  @Field(() => FarmHealth)
  healthScore: FarmHealth;

  @Field(() => HealthAlert, { nullable: true })
  topAlert?: HealthAlert;
}

@ObjectType()
export class PaginatedFarmHealthSummaries {
  @Field(() => [FarmHealthSummary])
  data: FarmHealthSummary[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  lastPage: number;
}
