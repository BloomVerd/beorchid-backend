import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum CoinSide {
  BUY = 'buy',
  SELL = 'sell',
}

registerEnumType(CoinSide, { name: 'CoinSide' });

@ObjectType()
@Entity('coin_transactions')
export class CoinTransaction {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  userId: string;

  @Field()
  @Column()
  coinId: string;

  @Field(() => CoinSide)
  @Column({ type: 'enum', enum: CoinSide })
  side: CoinSide;

  @Field(() => Number)
  @Column({ type: 'numeric' })
  units: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  unitPrice: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  grossAmount: number;

  @Field(() => Int)
  @Column({ type: 'bigint', default: 0 })
  fee: number;

  @Field()
  @CreateDateColumn()
  executedAt: Date;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  ledgerRef: string | null;
}
