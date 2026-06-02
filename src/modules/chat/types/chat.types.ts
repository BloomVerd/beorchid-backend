import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Chat } from '../entities/chat.entity';

@ObjectType()
export class PaginatedChats {
  @Field(() => [Chat])
  data: Chat[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  lastPage: number;
}
