import { Field, Float, InputType } from '@nestjs/graphql';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
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

  @Field(() => Float, { nullable: true })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @Field(() => Float, { nullable: true })
  @IsNumber()
  @IsOptional()
  lon?: number;
}
