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

/**
 * GraphQL resolver for subscription plan discovery and subscription management.
 *
 * Public query:
 *  - `listSubscriptionPlans` — no auth required; returns all active plans for
 *    display on a pricing page.
 *
 * Authenticated queries/mutations (require JWT):
 *  - `getMySubscription` — returns the caller's active subscription (auto-assigns
 *    FREE for legacy accounts).
 *  - `initiateSubscriptionPayment` — starts a Paystack payment flow; returns the
 *    checkout URL. Proration credit is applied automatically.
 */
@Resolver()
export class SubscriptionResolver {
  constructor(
    private readonly planService: SubscriptionPlanService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /** Returns all active subscription plans. No authentication required. */
  @Query(() => [SubscriptionPlan])
  listSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return this.planService.findAll();
  }

  /**
   * Returns the authenticated farmer's current ACTIVE subscription. Auto-assigns
   * the FREE plan if the account pre-dates the subscription system.
   */
  @Query(() => FarmerSubscription)
  @UseGuards(GqlJwtAuthGuard)
  getMySubscription(
    @CurrentFarmer() farmer: Farmer,
  ): Promise<FarmerSubscription> {
    return this.subscriptionService.getActiveSubscription(farmer.id);
  }

  /**
   * Initiates a Paystack subscription payment. Returns the checkout URL and
   * reference. If proration credit covers the full cost, the plan is activated
   * immediately and both fields are returned as empty strings.
   */
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
      input.callbackUrl,
    );
  }
}
