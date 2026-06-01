import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { CropType } from '../../farm/entities/farm.entity';
import { GrowthStage } from './health.enums';
import { FarmHealth } from './farm-health.entity';

@ObjectType()
@Entity('crop_field_health')
export class CropFieldHealth {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  field_name: string;

  @Field(() => CropType)
  @Column({ type: 'enum', enum: CropType, default: CropType.MAIZE })
  crop_type: CropType;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  health_percent: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  ndvi: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  disease_probability: number;

  @Field({ nullable: true })
  @Column({ nullable: true })
  disease_type?: string;

  @Field(() => GrowthStage)
  @Column({
    type: 'enum',
    enum: GrowthStage,
    default: GrowthStage.VEGETATIVE,
  })
  growth_stage: GrowthStage;

  @Field()
  @Column()
  expected_harvest: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FarmHealth, (fh) => fh.crop_field_health, {
    onDelete: 'CASCADE',
  })
  farmHealth: FarmHealth;
}
