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
@Entity('sensor_history_points')
export class SensorHistoryPoint {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'date' })
  date: string;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  moisture: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  temperature: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  nitrogen: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  phosphorus: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  potassium: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FarmHealth, (fh) => fh.sensor_history, {
    onDelete: 'CASCADE',
  })
  farmHealth: FarmHealth;
}
