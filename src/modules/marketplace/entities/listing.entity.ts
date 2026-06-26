import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ImageData } from '../../farm/entities/image-data.entity';
import { FarmHealth } from '../../health/entities/farm-health.entity';

export enum ListingStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  UNDER_OFFER = 'under_offer',
  ACCEPTED = 'accepted',
  SOLD = 'sold',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

registerEnumType(ListingStatus, { name: 'ListingStatus' });

@ObjectType()
@Entity('listings')
export class Listing {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  farmId: string;

  @Field()
  @Column()
  sellerId: string;

  @Field()
  @Column()
  crop: string;

  @Field(() => Number)
  @Column({ type: 'numeric' })
  acreage: number;

  @Field()
  @Column()
  region: string;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  askingPrice: number;

  @Field()
  @Column({ default: 'GHS' })
  currency: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => ListingStatus)
  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.DRAFT })
  status: ListingStatus;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => Float, { nullable: true })
  lat?: number | null;

  @Field(() => Float, { nullable: true })
  lon?: number | null;

  @Field(() => [ImageData], { nullable: true })
  farmImages?: ImageData[];

  @Field(() => FarmHealth, { nullable: true })
  farmHealth?: FarmHealth | null;
}
