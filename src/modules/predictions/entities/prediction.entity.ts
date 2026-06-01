import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, Float, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Farm } from '../../farm/entities/farm.entity';
import {
  ImageData,
  PredictionType,
} from '../../farm/entities/image-data.entity';

export enum RiskLevel {
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
}

registerEnumType(RiskLevel, { name: 'RiskLevel' });

@ObjectType()
@Entity('predictions')
export class Prediction {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => Float)
  @Column({ type: 'float' })
  lat: number;

  @Field(() => Float)
  @Column({ type: 'float' })
  lon: number;

  @Field(() => PredictionType)
  @Column({ type: 'enum', enum: PredictionType })
  prediction_type: PredictionType;

  @Field(() => RiskLevel, { nullable: true })
  @Column({ type: 'enum', enum: RiskLevel, nullable: true })
  risk_level?: RiskLevel;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Farm, 'predictions')
  farm: Farm;

  @ManyToOne(() => ImageData, 'predictions', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  image?: ImageData;
}
