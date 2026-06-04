import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IotDevice } from './iot-device.entity';

export enum IotCommandType {
  IRRIGATE = 'IRRIGATE',
  STOP_IRRIGATION = 'STOP_IRRIGATION',
  CAPTURE_IMAGE = 'CAPTURE_IMAGE',
  ACTIVATE_SENSOR = 'ACTIVATE_SENSOR',
  DEACTIVATE_SENSOR = 'DEACTIVATE_SENSOR',
}

export enum IotToolCallStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

registerEnumType(IotCommandType, { name: 'IotCommandType' });
registerEnumType(IotToolCallStatus, { name: 'IotToolCallStatus' });

@ObjectType()
@Entity('iot_tool_calls')
export class IotToolCall {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => IotCommandType)
  @Column({ type: 'enum', enum: IotCommandType })
  command_type: IotCommandType;

  @Field(() => Object, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  parameters?: Record<string, unknown>;

  @Field(() => IotToolCallStatus)
  @Column({ type: 'enum', enum: IotToolCallStatus, default: IotToolCallStatus.PENDING })
  status: IotToolCallStatus;

  @Field(() => Object, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  response?: Record<string, unknown>;

  @Field()
  @Column()
  requested_by: string;

  @Field(() => IotDevice)
  @ManyToOne(() => IotDevice, { eager: false, onDelete: 'CASCADE' })
  iot_device: IotDevice;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
