import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { AlertSeverity } from './health.enums';
import { FarmHealth } from './farm-health.entity';

@ObjectType()
@Entity('health_alerts')
export class HealthAlert {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => AlertSeverity)
  @Column({
    type: 'enum',
    enum: AlertSeverity,
    default: AlertSeverity.INFO,
  })
  severity: AlertSeverity;

  @Field()
  @Column()
  title: string;

  @Field()
  @Column({ type: 'text' })
  description: string;

  @Field()
  @Column({ type: 'text' })
  action: string;

  @Field()
  @Column()
  estimated_impact: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FarmHealth, (fh) => fh.health_alerts, {
    onDelete: 'CASCADE',
  })
  farmHealth: FarmHealth;
}
