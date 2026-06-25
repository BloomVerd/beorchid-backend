import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Entity('investment_settlements')
export class InvestmentSettlement {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  planId: string;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  actualProfitPerUnit: number;

  @Field()
  @Column()
  settledBy: string;

  @Field()
  @CreateDateColumn()
  settledAt: Date;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
