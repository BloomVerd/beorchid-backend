import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

export enum PlanName {
  FREE = 'free',
  POPULAR = 'popular',
  PREMIUM = 'premium',
}

@ObjectType()
@Entity('subscription_plans')
export class SubscriptionPlan {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'varchar', unique: true })
  name: string;

  @Field()
  @Column()
  displayName: string;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  priceAmount: number;

  @Field()
  @Column({ default: 'GHS' })
  currency: string;

  @Field(() => Int)
  @Column({ type: 'int', default: 3 })
  predictionWeeklyLimit: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 3600 })
  farmDataLookbackSeconds: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 3600 })
  farmDataCacheTtlSeconds: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 3600 })
  healthReportIntervalSeconds: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 2 })
  maxFarms: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  durationDays: number;

  @Field(() => [String])
  @Column({ type: 'simple-json', default: '[]' })
  features: string[];

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
