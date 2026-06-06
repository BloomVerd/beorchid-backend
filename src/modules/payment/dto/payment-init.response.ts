import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PaymentInitResponse {
  @Field()
  authorizationUrl: string;

  @Field()
  reference: string;
}
