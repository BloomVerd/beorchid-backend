import { SetMetadata } from '@nestjs/common';
import { PlanName } from 'src/modules/payment/entities/subscription-plan.entity';

export const REQUIRED_PLAN_KEY = 'requiredPlan';
export const RequiresPlan = (plan: PlanName) =>
  SetMetadata(REQUIRED_PLAN_KEY, plan);
