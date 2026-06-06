import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { FarmerSubscription } from './entities/farmer-subscription.entity';
import { PaymentInitResponse } from './dto/payment-init.response';
import { InitiatePaymentInput } from './inputs/initiate-payment.input';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionService } from './subscription.service';
import { GqlJwtAuthGuard } from 'src/common/guards/gql-jwt-auth.gurad';
import { CurrentFarmer } from 'src/common/decorators/current-farmer.decorator';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver()
export class SubscriptionResolver {
  constructor(
    private readonly planService: SubscriptionPlanService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Query(() => [SubscriptionPlan])
  listSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return this.planService.findAll();
  }

  @Query(() => FarmerSubscription)
  @UseGuards(GqlJwtAuthGuard)
  getMySubscription(
    @CurrentFarmer() farmer: Farmer,
  ): Promise<FarmerSubscription> {
    return this.subscriptionService.getActiveSubscription(farmer.id);
  }

  @Mutation(() => PaymentInitResponse)
  @UseGuards(GqlJwtAuthGuard)
  async initiateSubscriptionPayment(
    @Args('input') input: InitiatePaymentInput,
    @CurrentFarmer() farmer: Farmer,
  ): Promise<PaymentInitResponse> {
    const farmerRecord = farmer as Farmer & { email: string };
    return this.subscriptionService.initiatePayment(
      farmerRecord.id,
      farmerRecord.email,
      input.planId,
    );
  }
}
