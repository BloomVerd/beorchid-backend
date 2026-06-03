import { Field, Int, ObjectType } from '@nestjs/graphql';
import { IotToolCall } from '../entities/iot-tool-call.entity';

@ObjectType()
export class PaginatedIotToolCalls {
  @Field(() => [IotToolCall])
  data: IotToolCall[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  lastPage: number;
}
