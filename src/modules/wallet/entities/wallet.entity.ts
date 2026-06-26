import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, Float, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum WalletOwnerType {
  USER = 'user',
  ORG = 'org',
}

registerEnumType(WalletOwnerType, { name: 'WalletOwnerType' });

@ObjectType()
@Entity('wallets')
export class Wallet {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => WalletOwnerType)
  @Column({ type: 'enum', enum: WalletOwnerType })
  ownerType: WalletOwnerType;

  @Field()
  @Column()
  ownerId: string;

  @Field()
  @Column({ default: 'GHS' })
  currency: string;

  @Field(() => Float)
  @Column({ type: 'bigint', default: 0 })
  availableBalance: number;

  @Field(() => Float)
  @Column({ type: 'bigint', default: 0 })
  lockedBalance: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
