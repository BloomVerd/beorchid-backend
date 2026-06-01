import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Farm } from '../entities/farm.entity';
import { ImageData } from '../entities/image-data.entity';

@ObjectType()
export class PaginatedFarms {
  @Field(() => [Farm])
  data: Farm[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  lastPage: number;
}

@ObjectType()
export class PaginatedImages {
  @Field(() => [ImageData])
  data: ImageData[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  lastPage: number;
}
