import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  FarmerSubscription,
  SubscriptionStatus,
} from './entities/farmer-subscription.entity';
import {
  PaymentTransaction,
  TransactionStatus,
} from './entities/payment-transaction.entity';
import {
  PlanName,
  SubscriptionPlan,
} from './entities/subscription-plan.entity';
import { SubscriptionPlanService } from './subscription-plan.service';
import { PaymentService } from './payment.service';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { Farmer } from '../farmer/entities/farmer.entity';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { NotificationType } from '../notifications/entities/notification.entity';
import { EmailProducer } from '../email/email.producer';
import { SmsService } from '../sms/sms.service';

const PLAN_HIERARCHY: Record<string, number> = {
  [PlanName.FREE]: 0,
  [PlanName.POPULAR]: 1,
  [PlanName.PREMIUM]: 2,
};

/**
 * Service for the full subscription lifecycle: free-plan assignment, paid
 * plan initiation with proration, webhook-triggered activation, and
 * multi-channel activation notifications.
 *
 * Subscription flow:
 *  1. On farmer registration, `assignFreePlan` creates a FREE subscription
 *     and syncs `FarmerSettings` to free-tier limits.
 *  2. To upgrade, the client calls `initiatePayment` → a `PaymentTransaction`
 *     row is created; the Paystack checkout URL is returned.
 *     - If the farmer already has a paid subscription, proration credit is
 *       calculated from the remaining period. When credit covers the full new
 *       plan cost, `activateImmediately` is called without charging.
 *  3. On `charge.success` webhook, `activateSubscription` verifies the
 *     transaction with Paystack, expires the old subscription, creates a new
 *     ACTIVE one, syncs settings, and dispatches in-app/email/SMS notifications.
 *
 * `getActiveSubscription` auto-assigns the FREE plan for legacy accounts that
 * pre-date the subscription system.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(FarmerSubscription)
    private readonly subscriptionRepo: Repository<FarmerSubscription>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly planService: SubscriptionPlanService,
    private readonly paymentService: PaymentService,
    private readonly settingsService: FarmerSettingsService,
    private readonly notificationsProducer: NotificationsProducer,
    private readonly emailProducer: EmailProducer,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Creates an ACTIVE FREE subscription for the farmer and syncs
   * `FarmerSettings` to free-tier limits.
   *
   * @throws NotFoundException if the FREE plan is not seeded in the database
   */
  async assignFreePlan(farmerId: string): Promise<FarmerSubscription> {
    const freePlan = await this.planService.findByName(PlanName.FREE);
    if (!freePlan) throw new NotFoundException('Free plan not found');

    const subscription = this.subscriptionRepo.create({
      farmer: { id: farmerId } as Farmer,
      plan: freePlan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    });
    const saved = await this.subscriptionRepo.save(subscription);
    await this.syncSettings(farmerId, freePlan);
    return saved;
  }

  /**
   * Returns the farmer's current ACTIVE subscription. For legacy accounts
   * with no subscription row, automatically assigns the FREE plan.
   */
  async getActiveSubscription(farmerId: string): Promise<FarmerSubscription> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { farmer: { id: farmerId }, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (subscription) return subscription;

    // Old account without subscription — auto-assign free plan
    return this.assignFreePlan(farmerId);
  }

  /**
   * Initiates a Paystack payment for a subscription upgrade or switch.
   * Calculates proration credit from the remaining period of an existing paid
   * subscription. If the credit covers the full new plan cost, activates
   * immediately without charging (returns empty `authorizationUrl` and
   * `reference`).
   *
   * @throws NotFoundException   if the plan is not found or inactive
   * @throws BadRequestException if the target plan is FREE (free plan cannot be purchased)
   */
  async initiatePayment(
    farmerId: string,
    farmerEmail: string,
    planId: string,
    callbackUrl?: string,
  ): Promise<{ authorizationUrl: string; reference: string }> {
    const newPlan = await this.planService.findById(planId);
    if (!newPlan || !newPlan.isActive) {
      throw new NotFoundException('Subscription plan not found');
    }
    if (newPlan.name === PlanName.FREE) {
      throw new BadRequestException(
        'Cannot initiate payment for the free plan',
      );
    }

    const currentSub = await this.subscriptionRepo.findOne({
      where: { farmer: { id: farmerId }, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    let chargeAmount = newPlan.priceAmount;
    let prorationMetadata: Record<string, unknown> = {};

    if (
      currentSub &&
      currentSub.plan.name !== PlanName.FREE &&
      currentSub.currentPeriodEnd
    ) {
      const now = Date.now();
      const periodEnd = currentSub.currentPeriodEnd.getTime();
      const periodStart = currentSub.currentPeriodStart.getTime();
      const totalMs = periodEnd - periodStart;
      const remainingMs = Math.max(0, periodEnd - now);
      const credit = Math.floor(
        (remainingMs / totalMs) * currentSub.plan.priceAmount,
      );
      chargeAmount = Math.max(0, newPlan.priceAmount - credit);

      prorationMetadata = {
        previousPlanId: currentSub.plan.id,
        previousPlanName: currentSub.plan.name,
        credit,
        originalAmount: newPlan.priceAmount,
        chargedAmount: chargeAmount,
      };

      // Downgrade where credit covers full new plan cost — activate immediately
      if (chargeAmount === 0) {
        await this.activateImmediately(farmerId, currentSub, newPlan, credit);
        return { authorizationUrl: '', reference: '' };
      }
    }

    const reference = `beorchid-${farmerId.slice(0, 8)}-${crypto.randomBytes(6).toString('hex')}`;

    const { authorizationUrl, accessCode } =
      await this.paymentService.initializeTransaction(
        farmerEmail,
        chargeAmount,
        reference,
        { farmerId, planId, ...prorationMetadata },
        callbackUrl,
      );

    await this.transactionRepo.save(
      this.transactionRepo.create({
        farmer: { id: farmerId } as Farmer,
        planId,
        paystackReference: reference,
        paystackAccessCode: accessCode,
        amount: chargeAmount,
        currency: newPlan.currency,
        status: TransactionStatus.PENDING,
        metadata: prorationMetadata,
      }),
    );

    return { authorizationUrl, reference };
  }

  /**
   * Activates a subscription after a successful Paystack `charge.success`
   * webhook. Idempotent — returns early if the transaction is already SUCCESS.
   * On success:
   *  1. Verifies the transaction with Paystack.
   *  2. Expires the existing ACTIVE subscription.
   *  3. Creates a new ACTIVE subscription for the plan period.
   *  4. Syncs `FarmerSettings` to the new plan's limits.
   *  5. Dispatches in-app, email, and SMS activation notifications per settings.
   *
   * @throws NotFoundException if the transaction or plan is not found
   */
  async activateSubscription(reference: string): Promise<void> {
    const transaction = await this.transactionRepo.findOne({
      where: { paystackReference: reference },
      relations: ['farmer'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction not found: ${reference}`);
    }
    if (transaction.status === TransactionStatus.SUCCESS) return;

    const paystackData = await this.paymentService.verifyTransaction(reference);
    if (paystackData.status !== 'success') {
      transaction.status = TransactionStatus.FAILED;
      await this.transactionRepo.save(transaction);
      return;
    }

    const plan = await this.planService.findById(transaction.planId);
    if (!plan) throw new NotFoundException('Plan not found');

    // Expire existing active paid subscription
    await this.subscriptionRepo.update(
      {
        farmer: { id: transaction.farmer.id },
        status: SubscriptionStatus.ACTIVE,
      },
      { status: SubscriptionStatus.EXPIRED },
    );

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + plan.durationDays);

    const subscription = await this.subscriptionRepo.save(
      this.subscriptionRepo.create({
        farmer: transaction.farmer,
        plan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
        paystackCustomerCode: paystackData.customer?.customer_code,
      }),
    );

    transaction.status = TransactionStatus.SUCCESS;
    transaction.subscription = subscription;
    await this.transactionRepo.save(transaction);

    await this.syncSettings(transaction.farmer.id, plan);
    await this.dispatchActivationNotification(transaction.farmer, plan);
  }

  /** Returns the numeric hierarchy position of a plan name (FREE=0, POPULAR=1, PREMIUM=2). */
  getPlanHierarchy(planName: string): number {
    return PLAN_HIERARCHY[planName] ?? 0;
  }

  /** Syncs `FarmerSettings` limits and notification flags to the given plan's configuration. */
  private async syncSettings(
    farmerId: string,
    plan: SubscriptionPlan,
  ): Promise<void> {
    const isPaid =
      plan.name === PlanName.POPULAR || plan.name === PlanName.PREMIUM;
    await this.settingsService.update(farmerId, {
      predictionWeeklyLimit: plan.predictionWeeklyLimit,
      farmDataLookbackSeconds: plan.farmDataLookbackSeconds,
      farmDataCacheTtlSeconds: plan.farmDataCacheTtlSeconds,
      healthReportIntervalSeconds: plan.healthReportIntervalSeconds,
      notifyEmail: isPaid,
      notifySms: isPaid,
    });
  }

  /** Dispatches in-app, email, and SMS activation notifications according to the farmer's settings. */
  private async dispatchActivationNotification(
    farmer: Farmer,
    plan: SubscriptionPlan,
  ): Promise<void> {
    const settings = await this.settingsService.getOrCreate(farmer.id);
    const intervalHours = Math.round(plan.healthReportIntervalSeconds / 3600);
    const summary =
      `Your ${plan.displayName} plan is now active. ` +
      `Enjoy ${plan.predictionWeeklyLimit} predictions/week and health reports every ${intervalHours} hour(s).`;

    await this.notificationsProducer.notify(
      farmer.id,
      {
        title: 'Subscription activated',
        message: summary,
        type: NotificationType.SUBSCRIPTION_ACTIVATED,
      },
      settings.notifyInApp,
    );

    if (settings.notifyEmail) {
      await this.emailProducer.sendSubscriptionActivated({
        email: farmer.email,
        firstName: farmer.firstName,
        planName: plan.displayName,
        summary,
      });
    }

    if (settings.notifySms && settings.smsPhoneNumber) {
      await this.smsService.sendSubscriptionActivated(
        settings.smsPhoneNumber,
        plan.displayName,
      );
    }
  }

  /** Immediately switches the farmer's plan in-place (no charge) when proration credit covers the cost. */
  private async activateImmediately(
    farmerId: string,
    currentSub: FarmerSubscription,
    newPlan: SubscriptionPlan,
    credit: number,
  ): Promise<void> {
    // Extend period based on leftover credit value
    const now = new Date();
    const remainingDays = Math.floor(
      (credit / currentSub.plan.priceAmount) * currentSub.plan.durationDays,
    );
    const newPeriodEnd = new Date(now);
    newPeriodEnd.setDate(newPeriodEnd.getDate() + remainingDays);

    currentSub.plan = newPlan;
    currentSub.currentPeriodEnd = newPeriodEnd;
    await this.subscriptionRepo.save(currentSub);
    await this.syncSettings(farmerId, newPlan);
  }
}
