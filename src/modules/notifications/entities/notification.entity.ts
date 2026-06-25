import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Farmer } from '../../farmer/entities/farmer.entity';

export enum NotificationType {
  PREDICTION_ALERT           = 'PREDICTION_ALERT',
  HEALTH_ALERT               = 'HEALTH_ALERT',
  SUBSCRIPTION_ACTIVATED     = 'SUBSCRIPTION_ACTIVATED',
  FARM_SETUP_COMPLETE        = 'FARM_SETUP_COMPLETE',
  // System 2 types
  OFFER_RECEIVED             = 'OFFER_RECEIVED',
  OFFER_ACCEPTED             = 'OFFER_ACCEPTED',
  OFFER_REJECTED             = 'OFFER_REJECTED',
  OFFER_COUNTERED            = 'OFFER_COUNTERED',
  DEAL_PAYMENT_REQUIRED      = 'DEAL_PAYMENT_REQUIRED',
  DEAL_COMPLETED             = 'DEAL_COMPLETED',
  INVESTMENT_PURCHASED       = 'INVESTMENT_PURCHASED',
  INVESTMENT_MATURED         = 'INVESTMENT_MATURED',
  INVESTMENT_SETTLED         = 'INVESTMENT_SETTLED',
  COIN_PRICE_ALERT           = 'COIN_PRICE_ALERT',
  COIN_DELISTED              = 'COIN_DELISTED',
  WALLET_DEPOSIT_COMPLETED   = 'WALLET_DEPOSIT_COMPLETED',
  WALLET_WITHDRAWAL_COMPLETED = 'WALLET_WITHDRAWAL_COMPLETED',
  LISTING_MATCH              = 'LISTING_MATCH',
  MARKET_NEW_INSIGHT         = 'MARKET_NEW_INSIGHT',
  FIELD_OBSERVATION_APPROVED = 'FIELD_OBSERVATION_APPROVED',
  FIELD_OBSERVATION_REJECTED = 'FIELD_OBSERVATION_REJECTED',
  MARKET_DATA_UPDATED        = 'MARKET_DATA_UPDATED',
  INGESTION_JOB_COMPLETED    = 'INGESTION_JOB_COMPLETED',
  INGESTION_JOB_FAILED       = 'INGESTION_JOB_FAILED',
  EXTERNAL_FEED_ERROR        = 'EXTERNAL_FEED_ERROR',
}

registerEnumType(NotificationType, { name: 'NotificationType' });

@ObjectType()
@Entity('notifications')
export class Notification {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  title: string;

  @Field()
  @Column('text')
  message: string;

  @Field(() => NotificationType)
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Field()
  @Column({ default: false })
  isRead: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Farmer, { onDelete: 'CASCADE' })
  farmer: Farmer;
}
