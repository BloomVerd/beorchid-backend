import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

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

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Field(() => ListingStatus)
  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.DRAFT })
  status: ListingStatus;

  @Field({ nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
