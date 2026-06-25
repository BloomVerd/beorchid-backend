import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum InsightType {
  SUPPLY_DEMAND = 'supply_demand',
  SEASONALITY = 'seasonality',
  VOLATILITY = 'volatility',
  REGIONAL_COMPARISON = 'regional_comparison',
  TOP_CROPS = 'top_crops',
  REPORT = 'report',
}

registerEnumType(InsightType, { name: 'InsightType' });

@ObjectType()
@Entity('market_survey_insights')
export class MarketSurveyInsight {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  cropId: string | null;

  @Field({ nullable: true })
  @Column({ nullable: true })
  region: string | null;

  @Field(() => InsightType)
  @Column({ type: 'enum', enum: InsightType })
  type: InsightType;

  @Field(() => Object)
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Field()
  @Column({ type: 'timestamptz' })
  publishedAt: Date;

  @Field()
  @Column()
  authorId: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
