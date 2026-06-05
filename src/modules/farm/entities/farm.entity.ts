import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  Field,
  Float,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { Farmer } from '../../farmer/entities/farmer.entity';
import { Coordinate } from './coordinate.entity';
import { ImageData } from './image-data.entity';
import { IotDevice } from './iot-device.entity';

export enum CropType {
  MAIZE = 'MAIZE',
  RICE = 'RICE',
  CASSAVA = 'CASSAVA',
  VEGETABLES = 'VEGETABLES',
}

export enum SizeUnit {
  HECTARES = 'HECTARES',
}

export enum FarmType {
  FIELD = 'FIELD',
  GREENHOUSE = 'GREENHOUSE',
}

export enum SetupStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETE = 'COMPLETE',
}

export enum SoilType {
  CLAY = 'CLAY',
  SANDY = 'SANDY',
  LOAM = 'LOAM',
  SILT = 'SILT',
  PEAT = 'PEAT',
  CHALK = 'CHALK',
}

export enum GrowthStage {
  GERMINATION = 'germination',
  VEGETATIVE = 'vegetative',
  FLOWERING = 'flowering',
  FRUITING = 'fruiting',
  MATURATION = 'maturation',
}

registerEnumType(CropType, { name: 'CropType' });
registerEnumType(SizeUnit, { name: 'SizeUnit' });
registerEnumType(FarmType, { name: 'FarmType' });
registerEnumType(SetupStatus, { name: 'SetupStatus' });
registerEnumType(SoilType, { name: 'SoilType' });
registerEnumType(GrowthStage, { name: 'GrowthStage' });

@ObjectType()
@Entity('farms')
export class Farm {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  name: string;

  @Field(() => CropType)
  @Column({ type: 'enum', enum: CropType, default: CropType.MAIZE })
  crop_type: CropType;

  @Field({ nullable: true })
  @Column({ nullable: true })
  variety?: string;

  @Field(() => Float)
  @Column({ type: 'float' })
  farm_size: number;

  @Field(() => SizeUnit)
  @Column({ type: 'enum', enum: SizeUnit, default: SizeUnit.HECTARES })
  size_unit: SizeUnit;

  @Field(() => FarmType)
  @Column({ type: 'enum', enum: FarmType, default: FarmType.FIELD })
  farm_type: FarmType;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  lat?: number;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  lon?: number;

  @Field(() => SetupStatus)
  @Column({ type: 'enum', enum: SetupStatus, default: SetupStatus.PENDING })
  setup_status: SetupStatus;

  @Field(() => SoilType, { nullable: true })
  @Column({ type: 'enum', enum: SoilType, nullable: true })
  soil_type?: SoilType;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  crop_density?: number;

  @Field(() => GrowthStage, { nullable: true })
  @Column({ type: 'enum', enum: GrowthStage, nullable: true })
  growth_stage?: GrowthStage;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  elevation_m?: number;

  @Field({ nullable: true })
  @Column({ type: 'int', nullable: true })
  days_to_maturity?: number;

  @Field(() => [String], { nullable: true })
  @Column({ type: 'simple-array', nullable: true })
  iot_device_ids?: string[];

  @Field({ nullable: true })
  @Column({ nullable: true })
  setup_photo_url?: string;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  setup_photo_lat?: number;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  setup_photo_lon?: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Farmer, 'farms')
  farmer: Farmer;

  @Field(() => [Coordinate], { nullable: true })
  @OneToMany(() => Coordinate, 'farm')
  coordinates: Coordinate[];

  @Field(() => [ImageData], { nullable: true })
  @OneToMany(() => ImageData, 'farm')
  farm_images: ImageData[];

  @Field(() => [IotDevice], { nullable: true })
  @OneToMany(() => IotDevice, 'farm')
  iot_devices: IotDevice[];

  @OneToMany('Prediction', 'farm')
  predictions: any[];

  @OneToMany('PredictionRange', 'farm')
  prediction_ranges: any[];

  @OneToMany('FarmHealth', 'farm')
  health_records: any[];
}
