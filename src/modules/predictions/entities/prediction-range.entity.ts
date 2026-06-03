import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Farm } from '../../farm/entities/farm.entity';

@ObjectType()
@Entity('prediction_ranges')
export class PredictionRange {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  week_start: Date;

  @Field()
  @Column()
  week_end: Date;

  @Field()
  @Column({ default: 0 })
  regeneration_count: number;

  @Field()
  @CreateDateColumn()
  inserted_at: Date;

  @ManyToOne(() => Farm, 'prediction_ranges')
  farm: Farm;

  @OneToMany('ImageData', 'prediction_range')
  range_images: any[];
}
