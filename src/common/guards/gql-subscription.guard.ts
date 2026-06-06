import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { REQUIRED_PLAN_KEY } from '../decorators/require-plan.decorator';
import { SubscriptionService } from 'src/modules/payment/subscription.service';
import { PlanName } from 'src/modules/payment/entities/subscription-plan.entity';

const PLAN_HIERARCHY: Record<string, number> = {
  [PlanName.FREE]: 0,
  [PlanName.POPULAR]: 1,
  [PlanName.PREMIUM]: 2,
};

@Injectable()
export class GqlSubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;

    const authHeader: string | undefined = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) return false;

    const token = authHeader.slice(7);
    let payload: { id: string; email: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      }) as { id: string; email: string };
    } catch {
      return false;
    }

    const subscription = await this.subscriptionService.getActiveSubscription(
      payload.id,
    );

    // Attach to request so downstream handlers can read it
    req.subscription = subscription;

    const requiredPlan = this.reflector.getAllAndOverride<PlanName | undefined>(
      REQUIRED_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPlan) return true;

    const farmerLevel = PLAN_HIERARCHY[subscription.plan.name] ?? 0;
    const requiredLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;

    if (farmerLevel < requiredLevel) {
      throw new ForbiddenException(
        `This feature requires the ${requiredPlan} plan or higher`,
      );
    }

    return true;
  }
}
