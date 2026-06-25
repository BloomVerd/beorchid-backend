import { ObjectType, Field } from '@nestjs/graphql';
import { FieldObservation } from '../entities/field-observation.entity';

@ObjectType()
export class ObservationBatchItem {
  @Field()
  index: number;

  @Field()
  success: boolean;

  @Field({ nullable: true })
  observationId?: string;

  @Field({ nullable: true })
  error?: string;

  @Field({ nullable: true })
  skipped?: boolean;
}

@ObjectType()
export class ObservationBatchResult {
  @Field(() => [ObservationBatchItem])
  results: ObservationBatchItem[];

  @Field()
  accepted: number;

  @Field()
  skipped: number;

  @Field()
  failed: number;
}
