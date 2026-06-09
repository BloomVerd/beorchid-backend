import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Farmer } from './farmer.entity';

@ObjectType()
@Entity('farmer_settings')
export class FarmerSettings {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => Int)
  @Column({ type: 'int', default: 3600 })
  farmDataLookbackSeconds: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 3600 })
  farmDataCacheTtlSeconds: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 3600 })
  healthReportIntervalSeconds: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 3 })
  predictionWeeklyLimit: number;

  @Field()
  @Column({ default: true })
  notifyInApp: boolean;

  @Field()
  @Column({ default: false })
  notifyEmail: boolean;

  @Field()
  @Column({ default: false })
  notifySms: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  smsPhoneNumber?: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => Farmer, { onDelete: 'CASCADE' })
  @JoinColumn()
  farmer: Farmer;
}
