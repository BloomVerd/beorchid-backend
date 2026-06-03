import { Field, Float, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum FarmDataStatus {
  PENDING = 'PENDING',
  READY = 'READY',
}

registerEnumType(FarmDataStatus, { name: 'FarmDataStatus' });

@ObjectType()
export class SensorReading {
  @Field(() => Float, { nullable: true })
  moisture?: number;

  @Field(() => Float, { nullable: true })
  temperature?: number;

  @Field(() => Float, { nullable: true })
  nitrogen?: number;

  @Field(() => Float, { nullable: true })
  phosphorus?: number;

  @Field(() => Float, { nullable: true })
  potassium?: number;

  @Field({ nullable: true })
  recorded_at?: string;
}

@ObjectType()
export class SensorSection {
  @Field(() => [SensorReading])
  readings: SensorReading[];

  @Field()
  summary: string;
}

@ObjectType()
export class IrrigationSection {
  @Field()
  recommendation: string;

  @Field(() => Float, { nullable: true })
  amount_mm?: number;

  @Field(() => Float, { nullable: true })
  urgency_hours?: number;

  @Field({ nullable: true })
  next_rainfall?: string;

  @Field()
  badge_text: string;
}

@ObjectType()
export class YieldSection {
  @Field(() => Float)
  tons_per_ha: number;

  @Field(() => Float)
  change_percent: number;

  @Field()
  trend: string;

  @Field()
  season: string;
}

@ObjectType()
export class FarmDataResult {
  @Field(() => FarmDataStatus)
  status: FarmDataStatus;

  @Field({ nullable: true })
  generated_at?: string;

  @Field(() => SensorSection, { nullable: true })
  sensors?: SensorSection;

  @Field(() => IrrigationSection, { nullable: true })
  irrigation?: IrrigationSection;

  @Field(() => YieldSection, { nullable: true })
  yield?: YieldSection;
}
