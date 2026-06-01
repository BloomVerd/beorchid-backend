import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { DiseaseSpread } from './health.enums';
import { FarmHealth } from './farm-health.entity';

@ObjectType()
@Entity('disease_alerts')
export class DiseaseAlert {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  disease_name: string;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  probability: number;

  @Field()
  @Column({ type: 'timestamptz' })
  first_detected: Date;

  @Field(() => DiseaseSpread)
  @Column({
    type: 'enum',
    enum: DiseaseSpread,
    default: DiseaseSpread.STABLE,
  })
  spread: DiseaseSpread;

  @Field()
  @Column({ type: 'text' })
  treatment: string;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  infected_leaves?: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FarmHealth, (fh) => fh.disease_alerts, {
    onDelete: 'CASCADE',
  })
  farmHealth: FarmHealth;
}
