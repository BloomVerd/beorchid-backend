import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  Field,
  Float,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { Farm } from './farm.entity';

export enum PredictionType {
  DISEASE_PREDICTION = 'DISEASE_PREDICTION',
  YIELD_PREDICTION = 'YIELD_PREDICTION',
}

registerEnumType(PredictionType, { name: 'PredictionType' });

@ObjectType()
@Entity('image_datas')
export class ImageData {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  url: string;

  @Field(() => Float)
  @Column({ type: 'float' })
  lat: number;

  @Field(() => Float)
  @Column({ type: 'float' })
  lon: number;

  @Field(() => [PredictionType])
  @Column({
    type: 'simple-array',
    default: PredictionType.DISEASE_PREDICTION,
  })
  prediction_types: PredictionType[];

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Farm, 'farm_images', { onDelete: 'CASCADE' })
  farm: Farm;

  /**
   * Nullable — images uploaded outside a scheduled prediction window
   * (e.g. during initial setup or ad-hoc) have no range attached.
   */
  @ManyToOne('PredictionRange', 'range_images', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  prediction_range?: any;

  @OneToMany('Prediction', 'image')
  predictions: any[];
}
