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
import { PlanName, SubscriptionPlan } from './entities/subscription-plan.entity';
import { SubscriptionPlanService } from './subscription-plan.service';
import { PaymentService } from './payment.service';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { Farmer } from '../farmer/entities/farmer.entity';

const PLAN_HIERARCHY: Record<string, number> = {
  [PlanName.FREE]: 0,
  [PlanName.POPULAR]: 1,
  [PlanName.PREMIUM]: 2,
};

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
  ) {}

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
      throw new BadRequestException('Cannot initiate payment for the free plan');
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
      { farmer: { id: transaction.farmer.id }, status: SubscriptionStatus.ACTIVE },
      { status: SubscriptionStatus.EXPIRED },
    );

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 30);

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
  }

  getPlanHierarchy(planName: string): number {
    return PLAN_HIERARCHY[planName] ?? 0;
  }

  private async syncSettings(
    farmerId: string,
    plan: SubscriptionPlan,
  ): Promise<void> {
    await this.settingsService.update(farmerId, {
      predictionWeeklyLimit: plan.predictionWeeklyLimit,
      farmDataLookbackSeconds: plan.farmDataLookbackSeconds,
      farmDataCacheTtlSeconds: plan.farmDataCacheTtlSeconds,
      healthReportIntervalSeconds: plan.healthReportIntervalSeconds,
    });
  }

  private async activateImmediately(
    farmerId: string,
    currentSub: FarmerSubscription,
    newPlan: SubscriptionPlan,
    credit: number,
  ): Promise<void> {
    // Extend period based on leftover credit value
    const now = new Date();
    const remainingDays = Math.floor(
      (credit / currentSub.plan.priceAmount) * 30,
    );
    const newPeriodEnd = new Date(now);
    newPeriodEnd.setDate(newPeriodEnd.getDate() + remainingDays);

    currentSub.plan = newPlan;
    currentSub.currentPeriodEnd = newPeriodEnd;
    await this.subscriptionRepo.save(currentSub);
    await this.syncSettings(farmerId, newPlan);
  }
}
