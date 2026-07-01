import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { InvestmentService } from './investment.service';
import { InvestmentPlan, PlanStatus } from './entities/investment-plan.entity';
import { InvestmentPurchase } from './entities/investment-purchase.entity';
import { InvestmentSettlement } from './entities/investment-settlement.entity';
import { CreatePlanInput } from './inputs/create-plan.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for the investment module. All operations require a valid
 * JWT (`GqlJwtAuthGuard`). Plan management mutations additionally require the
 * `super_admin` role. Any authenticated user may purchase units and view plans.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class InvestmentResolver {
  constructor(private readonly investmentService: InvestmentService) {}

  /**
   * Returns all investment plans. Supports optional filtering by status, crop,
   * maximum maturity days, and a low-risk flag that excludes plans with
   * "high", "moderate", or "medium" in their risk notes.
   */
  @Query(() => [InvestmentPlan])
  investmentPlans(
    @Args('status', { nullable: true, type: () => PlanStatus }) status?: PlanStatus,
    @Args('cropId', { nullable: true }) cropId?: string,
    @Args('maxMaturityDays', { nullable: true, type: () => Number }) maxMaturityDays?: number,
    @Args('lowRiskOnly', { nullable: true, type: () => Boolean }) lowRiskOnly?: boolean,
  ): Promise<InvestmentPlan[]> {
    return this.investmentService.listPlans(status, cropId, maxMaturityDays, lowRiskOnly);
  }

  /** Returns a single investment plan by ID. */
  @Query(() => InvestmentPlan)
  investmentPlan(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvestmentPlan> {
    return this.investmentService.findPlanById(id);
  }

  /** Returns all investment purchases made by the authenticated user. */
  @Query(() => [InvestmentPurchase])
  myInvestments(@CurrentFarmer() user: Farmer): Promise<InvestmentPurchase[]> {
    return this.investmentService.myInvestments(user.id);
  }

  /**
   * Creates a new investment plan in DRAFT status. Restricted to `super_admin`.
   * The plan is not visible to investors until `openInvestmentPlan` is called.
   */
  @Mutation(() => InvestmentPlan)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  createInvestmentPlan(
    @Args('input') input: CreatePlanInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<InvestmentPlan> {
    return this.investmentService.createPlan(input, user.id);
  }

  /**
   * Transitions a plan from DRAFT to OPEN, making it purchasable by investors.
   * Restricted to `super_admin`.
   */
  @Mutation(() => InvestmentPlan)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  openInvestmentPlan(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvestmentPlan> {
    return this.investmentService.openPlan(id);
  }

  /**
   * Closes a plan to new purchases. Existing active purchases are unaffected.
   * Restricted to `super_admin`.
   */
  @Mutation(() => InvestmentPlan)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  closeInvestmentPlan(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvestmentPlan> {
    return this.investmentService.closePlan(id);
  }

  /**
   * Purchases units in an open plan. Debits the investor's wallet and creates
   * an active `InvestmentPurchase`. Available to any authenticated user.
   */
  @Mutation(() => InvestmentPurchase)
  purchaseInvestment(
    @Args('planId', { type: () => ID }) planId: string,
    @Args('units', { type: () => Number }) units: number,
    @CurrentFarmer() user: Farmer,
  ): Promise<InvestmentPurchase> {
    return this.investmentService.purchase(planId, user.id, units);
  }

  /**
   * Settles all active purchases for a plan in a single transaction. Each
   * investor receives `principal + (units × actualProfitPerUnit)` credited to
   * their wallet and is notified. Creates an `InvestmentSettlement` audit
   * record. Restricted to `super_admin`.
   */
  @Mutation(() => InvestmentSettlement)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  settleInvestmentPlan(
    @Args('planId', { type: () => ID }) planId: string,
    @Args('actualProfitPerUnit', { type: () => Number }) actualProfitPerUnit: number,
    @Args('notes', { nullable: true, type: () => String }) notes: string | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<InvestmentSettlement> {
    return this.investmentService.settle(planId, actualProfitPerUnit, notes, user.id);
  }
}
