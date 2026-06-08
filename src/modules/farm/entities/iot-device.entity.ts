import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, Float, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Farm } from './farm.entity';

export enum DeviceType {
  SOIL_MOISTURE_SENSOR = 'SOIL_MOISTURE_SENSOR',
  WEATHER_STATION = 'WEATHER_STATION',
  IRRIGATION_CONTROLLER = 'IRRIGATION_CONTROLLER',
  AERIAL_SCOUT_DRONE = 'AERIAL_SCOUT_DRONE',
  FIELD_CAMERA = 'FIELD_CAMERA',
  TEMPERATURE_SENSOR = 'TEMPERATURE_SENSOR',
  HUMIDITY_SENSOR = 'HUMIDITY_SENSOR',
  OTHER = 'OTHER',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',     // sent telemetry within the last lookback window
  OFFLINE = 'OFFLINE',   // registered but no recent telemetry
  INACTIVE = 'INACTIVE', // not yet activated (is_active = false)
}

registerEnumType(DeviceType, { name: 'DeviceType' });
registerEnumType(DeviceStatus, { name: 'DeviceStatus' });

@ObjectType()
@Entity('iot_devices')
export class IotDevice {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  device_id: string;

  @Field()
  @Column()
  label: string;

  @Field(() => DeviceType)
  @Column({ type: 'enum', enum: DeviceType })
  device_type: DeviceType;

  @Field()
  @Column({ default: false })
  is_active: boolean;

  @Field(() => DeviceStatus)
  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.INACTIVE })
  status: DeviceStatus;

  @Field()
  @CreateDateColumn()
  registered_at: Date;

  // AWS IoT internal references — stored but not exposed via GraphQL
  @Column({ nullable: true })
  thing_name?: string;

  @Column({ nullable: true })
  thing_arn?: string;

  @Column({ nullable: true })
  certificate_id?: string;

  @Column({ nullable: true })
  certificate_arn?: string;

  // Certificate material — exposed only on first registration response
  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  certificate_pem?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  private_key?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  public_key?: string;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  lat?: number;

  @Field(() => Float, { nullable: true })
  @Column({ type: 'float', nullable: true })
  lon?: number;

  @ManyToOne(() => Farm, 'iot_devices', { onDelete: 'CASCADE' })
  farm: Farm;
}
