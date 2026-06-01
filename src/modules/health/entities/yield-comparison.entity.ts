import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { FarmHealth } from './farm-health.entity';

@ObjectType()
@Entity('yield_comparisons')
export class YieldComparison {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  field_name: string;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  current_yield: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  last_season_yield: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  confidence_min: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  confidence_max: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  revenue: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FarmHealth, (fh) => fh.yield_comparisons, {
    onDelete: 'CASCADE',
  })
  farmHealth: FarmHealth;
}
