import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum OfferStatus {
  PENDING = 'pending',
  COUNTERED = 'countered',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

registerEnumType(OfferStatus, { name: 'OfferStatus' });

@ObjectType()
@Entity('offers')
export class Offer {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  listingId: string;

  @Field()
  @Column()
  buyerId: string;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  amount: number;

  @Field()
  @Column({ default: 'GHS' })
  currency: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Field(() => OfferStatus)
  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.PENDING })
  status: OfferStatus;

  @Field({ nullable: true })
  @Column({ nullable: true })
  parentOfferId: string | null;

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
