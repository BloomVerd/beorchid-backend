import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional } from 'class-validator';
import { IotCommandType } from '../entities/iot-tool-call.entity';

@InputType()
export class TriggerIotDeviceInput {
  @Field(() => IotCommandType)
  @IsEnum(IotCommandType)
  command_type: IotCommandType;

  @Field(() => Object, { nullable: true, description: 'Optional command parameters as JSON' })
  @IsOptional()
  parameters?: Record<string, unknown>;
}
