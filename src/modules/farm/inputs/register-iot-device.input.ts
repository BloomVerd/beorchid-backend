import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DeviceType } from '../entities/iot-device.entity';

@InputType()
export class RegisterIotDeviceInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  label: string;

  @Field(() => DeviceType)
  @IsEnum(DeviceType)
  device_type: DeviceType;
}
