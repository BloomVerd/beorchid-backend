import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum PlanStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  CLOSED = 'closed',
  MATURED = 'matured',
  SETTLED = 'settled',
}

registerEnumType(PlanStatus, { name: 'PlanStatus' });

@ObjectType()
@Entity('investment_plans')
export class InvestmentPlan {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  cropId: string | null;

  @Field()
  @Column()
  title: string;

  @Field(() => Number, { nullable: true })
  @Column({ type: 'numeric', nullable: true })
  acreage: number | null;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  unitCost: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  expectedProfitMin: number;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  expectedProfitMax: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  maturityDays: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  totalUnits: number;

  @Field(() => Int)
  @Column({ type: 'int' })
  unitsRemaining: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  riskNotes: string | null;

  @Field(() => PlanStatus)
  @Column({ type: 'enum', enum: PlanStatus, default: PlanStatus.DRAFT })
  status: PlanStatus;

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
