import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum PurchaseStatus {
  ACTIVE = 'active',
  MATURED = 'matured',
  SETTLED = 'settled',
  CANCELLED = 'cancelled',
}

registerEnumType(PurchaseStatus, { name: 'PurchaseStatus' });

@ObjectType()
@Entity('investment_purchases')
export class InvestmentPurchase {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  planId: string;

  @Field()
  @Column()
  investorId: string;

  @Field(() => Int)
  @Column({ type: 'int' })
  units: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  principal: number;

  @Field(() => PurchaseStatus)
  @Column({ type: 'enum', enum: PurchaseStatus, default: PurchaseStatus.ACTIVE })
  status: PurchaseStatus;

  @Field()
  @CreateDateColumn()
  purchasedAt: Date;

  @Field()
  @Column({ type: 'timestamptz' })
  maturesAt: Date;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'bigint', nullable: true })
  payoutAmount: number | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  settlementLedgerRef: string | null;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
