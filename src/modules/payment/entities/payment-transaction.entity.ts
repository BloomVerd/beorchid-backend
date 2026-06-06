import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Farmer } from 'src/modules/farmer/entities/farmer.entity';
import { FarmerSubscription } from './farmer-subscription.entity';

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@ObjectType()
@Entity('payment_transactions')
export class PaymentTransaction {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  paystackReference: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  paystackAccessCode: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  amount: number;

  @Field()
  @Column({ default: 'GHS' })
  currency: string;

  @Field()
  @Column({ type: 'varchar' })
  status: string;

  @Field()
  @Column({ type: 'uuid' })
  planId: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Farmer, { onDelete: 'CASCADE' })
  @JoinColumn()
  farmer: Farmer;

  @ManyToOne(() => FarmerSubscription, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  subscription: FarmerSubscription | null;
}
