import { ObjectType, Field } from '@nestjs/graphql';
import { PaymentIntentV2 } from '../entities/payment-intent-v2.entity';

@ObjectType()
export class DepositResult {
  @Field(() => PaymentIntentV2)
  intent: PaymentIntentV2;

  @Field()
  checkoutUrl: string;
}
