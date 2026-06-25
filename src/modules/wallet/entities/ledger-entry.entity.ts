import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum LedgerDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

export enum LedgerAccount {
  USER_CASH = 'user_cash',
  ESCROW = 'escrow',
  PLATFORM_FEE = 'platform_fee',
  COIN_POOL = 'coin_pool',
  INVESTMENT_POOL = 'investment_pool',
  EXTERNAL = 'external',
}

registerEnumType(LedgerDirection, { name: 'LedgerDirection' });
registerEnumType(LedgerAccount, { name: 'LedgerAccount' });

@ObjectType()
@Entity('ledger_entries')
export class LedgerEntry {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  transactionId: string;

  @Field()
  @Column()
  walletId: string;

  @Field(() => LedgerDirection)
  @Column({ type: 'enum', enum: LedgerDirection })
  direction: LedgerDirection;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  amount: number;

  @Field(() => LedgerAccount)
  @Column({ type: 'enum', enum: LedgerAccount })
  account: LedgerAccount;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
