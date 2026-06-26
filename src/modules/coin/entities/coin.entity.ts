import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum CoinStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  DELISTED = 'delisted',
}

registerEnumType(CoinStatus, { name: 'CoinStatus' });

@ObjectType()
@Entity('coins')
export class Coin {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  name: string;

  @Field()
  @Column({ unique: true })
  symbol: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  cropId: string | null;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  basePrice: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  currentPrice: number;

  @Field(() => Number)
  @Column({ type: 'numeric', default: 0 })
  circulatingSupply: number;

  @Field(() => Object)
  @Column({ type: 'jsonb', default: '{"w_trend":0.3,"w_demand":0.2,"w_health":0.3,"w_vol":0.2}' })
  pricingWeights: Record<string, number>;

  @Field(() => CoinStatus)
  @Column({ type: 'enum', enum: CoinStatus, default: CoinStatus.DRAFT })
  status: CoinStatus;

  @Field()
  @Column()
  createdBy: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
