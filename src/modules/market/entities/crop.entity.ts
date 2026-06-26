import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { PriceDataPoint } from '../types/crop-price-series.type';

@ObjectType()
@Entity('crops')
export class Crop {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  name: string;

  @Field()
  @Column({ unique: true })
  slug: string;

  @Field()
  @Column({ default: 'per 100kg bag' })
  unit: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Field({ nullable: true })
  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Field(() => Object, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Field(() => [PriceDataPoint], { nullable: true })
  recentPrices?: PriceDataPoint[];

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
