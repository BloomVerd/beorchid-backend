import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum FieldPriceType {
  FARM_GATE = 'farm_gate',
  WHOLESALE = 'wholesale',
  RETAIL = 'retail',
  AUCTION = 'auction',
}

export enum QualityGrade {
  A = 'A',
  B = 'B',
  C = 'C',
  UNGRADED = 'ungraded',
}

export enum ObservationConfidence {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum ObservationStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

registerEnumType(FieldPriceType, { name: 'FieldPriceType' });
registerEnumType(QualityGrade, { name: 'QualityGrade' });
registerEnumType(ObservationConfidence, { name: 'ObservationConfidence' });
registerEnumType(ObservationStatus, { name: 'ObservationStatus' });

@ObjectType()
@Entity('field_observations')
export class FieldObservation {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  cropId: string;

  @Field()
  @Column()
  region: string;

  @Field()
  @Column({ type: 'timestamptz' })
  observedAt: Date;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  observedPrice: number;

  @Field(() => FieldPriceType)
  @Column({ type: 'enum', enum: FieldPriceType })
  priceType: FieldPriceType;

  @Field(() => Number, { nullable: true })
  @Column({ type: 'numeric', nullable: true })
  quantityAvailable: number | null;

  @Field(() => QualityGrade, { nullable: true })
  @Column({ type: 'enum', enum: QualityGrade, nullable: true })
  qualityGrade: QualityGrade | null;

  @Field()
  @Column({ type: 'text' })
  sourceNote: string;

  @Field()
  @Column()
  agentId: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  agentDeviceId: string | null;

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: '{}' })
  attachmentUrls: string[];

  @Field(() => [String])
  @Column({ type: 'text', array: true, default: '{}' })
  conditionTags: string[];

  @Field(() => ObservationConfidence)
  @Column({ type: 'enum', enum: ObservationConfidence })
  confidence: ObservationConfidence;

  @Field(() => ObservationStatus)
  @Column({ type: 'enum', enum: ObservationStatus, default: ObservationStatus.SUBMITTED })
  status: ObservationStatus;

  @Field({ nullable: true })
  @Column({ nullable: true })
  reviewedBy: string | null;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  reviewNote: string | null;

  @Field({ nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  marketPricePointId: string | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
