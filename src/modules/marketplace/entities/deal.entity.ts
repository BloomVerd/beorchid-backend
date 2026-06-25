import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum DealStatus {
  PENDING_PAYMENT = 'pending_payment',
  IN_ESCROW = 'in_escrow',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
}

registerEnumType(DealStatus, { name: 'DealStatus' });

@ObjectType()
@Entity('deals')
export class Deal {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  listingId: string;

  @Field()
  @Column()
  acceptedOfferId: string;

  @Field()
  @Column()
  sellerId: string;

  @Field()
  @Column()
  buyerId: string;

  @Field(() => Int)
  @Column({ type: 'bigint' })
  amount: number;

  @Field(() => DealStatus)
  @Column({ type: 'enum', enum: DealStatus, default: DealStatus.PENDING_PAYMENT })
  status: DealStatus;

  @Field({ nullable: true })
  @Column({ nullable: true })
  escrowLedgerRef: string | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
