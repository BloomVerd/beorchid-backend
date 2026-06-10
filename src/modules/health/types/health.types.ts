import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { CropType } from '../../farm/entities/farm.entity';
import { PredictionType } from '../../farm/entities/image-data.entity';
import { FarmHealth } from '../entities/farm-health.entity';
import { HealthAlert } from '../entities/health-alert.entity';
import { RiskLevel } from '../../predictions/entities/prediction.entity';
import { DiseaseAlert } from '../entities/disease-alert.entity';

@ObjectType()
export class WeatherForecast {
  @Field()
  date: string;

  @Field(() => Float)
  temperature: number;

  @Field(() => Float)
  humidity: number;

  @Field(() => Float)
  rainfall: number;

  @Field(() => Float)
  windSpeed: number;

  @Field()
  description: string;

  @Field()
  icon: string;
}

@ObjectType()
export class PredictionInsight {
  @Field()
  id: string;

  @Field(() => PredictionType)
  predictionType: PredictionType;

  @Field(() => RiskLevel, { nullable: true })
  riskLevel?: RiskLevel;

  @Field(() => Float)
  lat: number;

  @Field(() => Float)
  lon: number;

  @Field({ nullable: true })
  imageUrl?: string;

  @Field()
  createdAt: Date;

  @Field(() => [DiseaseAlert], { nullable: true })
  diseaseAlerts?: DiseaseAlert[];
}

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

  @Field(() => [WeatherForecast], { nullable: true })
  weather?: WeatherForecast[];

  @Field(() => [PredictionInsight], { nullable: true })
  predictions?: PredictionInsight[];
}

@ObjectType()
export class FarmHealthDetail {
  @Field(() => FarmHealth)
  health: FarmHealth;

  @Field(() => [WeatherForecast], { nullable: true })
  weather?: WeatherForecast[];

  @Field(() => [PredictionInsight], { nullable: true })
  predictions?: PredictionInsight[];
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
