import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Farmer } from 'src/modules/farmer/entities/farmer.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

@ObjectType()
@Entity('farmer_subscriptions')
export class FarmerSubscription {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => SubscriptionPlan)
  @ManyToOne(() => SubscriptionPlan, { eager: true, nullable: false })
  @JoinColumn()
  plan: SubscriptionPlan;

  @Field()
  @Column({ type: 'varchar' })
  status: string;

  @Field()
  @CreateDateColumn()
  currentPeriodStart: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  paystackCustomerCode: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  paystackSubscriptionCode: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Farmer, { onDelete: 'CASCADE' })
  @JoinColumn()
  farmer: Farmer;
}
