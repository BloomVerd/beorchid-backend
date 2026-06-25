import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Entity('coin_holdings')
export class CoinHolding {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  userId: string;

  @Field()
  @Column()
  coinId: string;

  @Field(() => Number)
  @Column({ type: 'numeric', default: 0 })
  units: number;

  @Field(() => Int)
  @Column({ type: 'bigint', default: 0 })
  avgCost: number;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
