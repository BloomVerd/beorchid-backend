import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Entity('coin_price_points')
export class CoinPricePoint {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  coinId: string;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  price: number;

  @Field()
  @CreateDateColumn()
  computedAt: Date;

  @Field(() => Object)
  @Column({ type: 'jsonb' })
  inputs: Record<string, unknown>;
}
