import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PlanName,
  SubscriptionPlan,
} from './entities/subscription-plan.entity';

const PLANS: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: PlanName.FREE,
    displayName: 'Free',
    priceAmount: 0,
    currency: 'GHS',
    durationDays: 0,
    predictionWeeklyLimit: 3,
    farmDataLookbackSeconds: 3600,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalSeconds: 3600,
    maxFarms: 2,
    features: ['Up to 2 farms', '3 AI predictions/week', '1h data history'],
    isActive: true,
  },
  {
    name: PlanName.POPULAR,
    displayName: 'Popular',
    priceAmount: 200000,
    currency: 'GHS',
    durationDays: 365,
    predictionWeeklyLimit: 15,
    farmDataLookbackSeconds: 86400,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalSeconds: 1800,
    maxFarms: 10,
    features: [
      'Up to 10 farms',
      '15 AI predictions/week',
      '24h data history',
      'Health reports every 30 min',
    ],
    isActive: true,
  },
  {
    name: PlanName.PREMIUM,
    displayName: 'Premium',
    priceAmount: 500000,
    currency: 'GHS',
    durationDays: 365,
    predictionWeeklyLimit: 50,
    farmDataLookbackSeconds: 604800,
    farmDataCacheTtlSeconds: 3600,
    healthReportIntervalSeconds: 900,
    maxFarms: 50,
    features: [
      'Up to 50 farms',
      '50 AI predictions/week',
      '7-day data history',
      'Health reports every 15 min',
      'Priority support',
    ],
    isActive: true,
  },
];

/**
 * Service for seeding and querying the subscription plan catalogue.
 *
 * Plan tiers (prices in pesewas):
 *  - FREE    — 0 GHS, 3 predictions/wk, 2 farms, 1h history
 *  - POPULAR — 2,000 GHS/yr, 15 predictions/wk, 10 farms, 24h history
 *  - PREMIUM — 5,000 GHS/yr, 50 predictions/wk, 50 farms, 7-day history
 *
 * `setupPlans` is called on application bootstrap to upsert all three plans,
 * so plan definitions are always in sync with the code constants above.
 */
@Injectable()
export class SubscriptionPlanService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
  ) {}

  /**
   * Upserts all plan definitions into the database. Called on bootstrap to
   * ensure the plan catalogue is always in sync with the `PLANS` constant.
   */
  async setupPlans(): Promise<void> {
    for (const plan of PLANS) {
      const existing = await this.planRepo.findOne({
        where: { name: plan.name },
      });
      if (existing) {
        await this.planRepo.save({ ...existing, ...plan });
      } else {
        await this.planRepo.save(this.planRepo.create(plan));
        console.log(`Subscription plan '${plan.name}' created`);
      }
    }
  }

  /** Returns all active subscription plans. */
  async findAll(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({ where: { isActive: true } });
  }

  /** Returns a single plan by ID, or null if not found. */
  async findById(id: string): Promise<SubscriptionPlan | null> {
    return this.planRepo.findOne({ where: { id } });
  }

  /** Returns a single plan by name (e.g. `PlanName.FREE`), or null if not found. */
  async findByName(name: string): Promise<SubscriptionPlan | null> {
    return this.planRepo.findOne({ where: { name } });
  }
}
