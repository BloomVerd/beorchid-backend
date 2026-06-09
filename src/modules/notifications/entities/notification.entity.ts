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
  PREDICTION_ALERT       = 'PREDICTION_ALERT',
  HEALTH_ALERT           = 'HEALTH_ALERT',
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  FARM_SETUP_COMPLETE    = 'FARM_SETUP_COMPLETE',
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
