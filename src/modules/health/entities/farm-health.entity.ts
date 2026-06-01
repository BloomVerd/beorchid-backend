import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { Farm } from '../../farm/entities/farm.entity';
import { CropFieldHealth } from './crop-field-health.entity';
import { DiseaseAlert } from './disease-alert.entity';
import { HealthAlert } from './health-alert.entity';
import { SensorHistoryPoint } from './sensor-history-point.entity';
import { YieldComparison } from './yield-comparison.entity';

// Re-export enums so existing imports from this file continue to work
export { GrowthStage, DiseaseSpread, AlertSeverity } from './health.enums';

@ObjectType()
@Entity('farm_health')
export class FarmHealth {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  overall_score: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  soil_health: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  crop_health: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  weather_stress: number;

  @Field(() => Float)
  @Column({ type: 'float', default: 0 })
  disease_risk: number;

  @Field({ nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  computed_at?: Date;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Farm, 'health_records', { onDelete: 'CASCADE' })
  farm: Farm;

  @Field(() => [CropFieldHealth], { nullable: true })
  @OneToMany(() => CropFieldHealth, (cfh) => cfh.farmHealth, { cascade: true })
  crop_field_health: CropFieldHealth[];

  @Field(() => [DiseaseAlert], { nullable: true })
  @OneToMany(() => DiseaseAlert, (da) => da.farmHealth, { cascade: true })
  disease_alerts: DiseaseAlert[];

  @Field(() => [HealthAlert], { nullable: true })
  @OneToMany(() => HealthAlert, (ha) => ha.farmHealth, { cascade: true })
  health_alerts: HealthAlert[];

  @Field(() => [SensorHistoryPoint], { nullable: true })
  @OneToMany(() => SensorHistoryPoint, (sp) => sp.farmHealth, { cascade: true })
  sensor_history: SensorHistoryPoint[];

  @Field(() => [YieldComparison], { nullable: true })
  @OneToMany(() => YieldComparison, (yc) => yc.farmHealth, { cascade: true })
  yield_comparisons: YieldComparison[];
}
