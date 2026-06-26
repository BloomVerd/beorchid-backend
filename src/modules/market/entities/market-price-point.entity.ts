import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Crop } from './crop.entity';

export enum PriceType {
  FARM_GATE = 'farm_gate',
  WHOLESALE = 'wholesale',
  RETAIL = 'retail',
  AUCTION = 'auction',
  INDEX = 'index',
}

registerEnumType(PriceType, { name: 'PriceType' });

@ObjectType()
@Entity('market_price_points')
@Index(['cropId', 'region', 'observedAt', 'priceType', 'source'], { unique: true })
export class MarketPricePoint {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  cropId: string;

  @Field()
  @Column()
  region: string;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  price: number;

  @Field()
  @Column({ default: 'GHS' })
  currency: string;

  @Field()
  @Column({ type: 'timestamptz' })
  observedAt: Date;

  @Field()
  @Column()
  source: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  sourceUrl: string | null;

  @Field(() => PriceType)
  @Column({ type: 'enum', enum: PriceType })
  priceType: PriceType;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'bigint', nullable: true })
  volumeKg: number | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  qualityGrade: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  ingestionJobId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  fieldObservationId: string | null;

  @Field()
  @Column({ default: false })
  isSuperseded: boolean;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  supersededBy: string | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Crop, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cropId' })
  crop: Crop;
}
