import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum PaymentIntentType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

export enum PaymentIntentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

registerEnumType(PaymentIntentType, { name: 'PaymentIntentType' });
registerEnumType(PaymentIntentStatus, { name: 'PaymentIntentStatus' });

@ObjectType()
@Entity('payment_intents_v2')
export class PaymentIntentV2 {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  walletId: string;

  @Field()
  @Column({ default: 'paystack' })
  provider: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  providerRef: string | null;

  @Field(() => PaymentIntentType)
  @Column({ type: 'enum', enum: PaymentIntentType })
  type: PaymentIntentType;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  amount: number;

  @Field(() => PaymentIntentStatus)
  @Column({ type: 'enum', enum: PaymentIntentStatus, default: PaymentIntentStatus.PENDING })
  status: PaymentIntentStatus;

  @Field()
  @Column({ unique: true })
  idempotencyKey: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  checkoutUrl: string | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
