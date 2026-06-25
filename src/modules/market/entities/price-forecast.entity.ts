import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Crop } from './crop.entity';

@ObjectType()
@Entity('price_forecasts')
export class PriceForecast {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  cropId: string;

  @Field()
  @Column()
  region: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  horizonDays: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  predictedPrice: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  confidenceLow: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  confidenceHigh: number;

  @Field()
  @Column()
  modelVersion: string;

  @Field()
  @Column({ type: 'timestamptz' })
  generatedAt: Date;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Crop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cropId' })
  crop: Crop;
}
