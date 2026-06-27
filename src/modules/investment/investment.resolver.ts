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

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class InvestmentResolver {
  constructor(private readonly investmentService: InvestmentService) {}

  @Query(() => [InvestmentPlan])
  investmentPlans(
    @Args('status', { nullable: true, type: () => PlanStatus }) status?: PlanStatus,
    @Args('cropId', { nullable: true }) cropId?: string,
    @Args('maxMaturityDays', { nullable: true, type: () => Number }) maxMaturityDays?: number,
    @Args('lowRiskOnly', { nullable: true, type: () => Boolean }) lowRiskOnly?: boolean,
  ): Promise<InvestmentPlan[]> {
    return this.investmentService.listPlans(status, cropId, maxMaturityDays, lowRiskOnly);
  }

  @Query(() => InvestmentPlan)
  investmentPlan(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvestmentPlan> {
    return this.investmentService.findPlanById(id);
  }

  @Query(() => [InvestmentPurchase])
  myInvestments(@CurrentFarmer() user: Farmer): Promise<InvestmentPurchase[]> {
    return this.investmentService.myInvestments(user.id);
  }

  @Mutation(() => InvestmentPlan)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  createInvestmentPlan(
    @Args('input') input: CreatePlanInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<InvestmentPlan> {
    return this.investmentService.createPlan(input, user.id);
  }

  @Mutation(() => InvestmentPlan)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  closeInvestmentPlan(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InvestmentPlan> {
    return this.investmentService.closePlan(id);
  }

  @Mutation(() => InvestmentPurchase)
  purchaseInvestment(
    @Args('planId', { type: () => ID }) planId: string,
    @Args('units', { type: () => Number }) units: number,
    @CurrentFarmer() user: Farmer,
  ): Promise<InvestmentPurchase> {
    return this.investmentService.purchase(planId, user.id, units);
  }

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
