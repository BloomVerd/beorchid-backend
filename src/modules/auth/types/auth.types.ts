import { Field, ObjectType } from '@nestjs/graphql';
import { Farmer } from '../../farmer/entities/farmer.entity';

@ObjectType()
export class AuthPayload {
  @Field(() => Farmer)
  farmer: Farmer;

  @Field()
  accessToken: string;

  @Field()
  refreshToken: string;
}

@ObjectType()
export class MessageResponse {
  @Field()
  message: string;
}
