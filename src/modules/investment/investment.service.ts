import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { InvestmentPlan, PlanStatus } from './entities/investment-plan.entity';
import { InvestmentPurchase, PurchaseStatus } from './entities/investment-purchase.entity';
import { InvestmentSettlement } from './entities/investment-settlement.entity';
import { CreatePlanInput } from './inputs/create-plan.input';
import { WalletService } from '../wallet/wallet.service';
import { LedgerAccount } from '../wallet/entities/ledger-entry.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class InvestmentService {
  constructor(
    @InjectRepository(InvestmentPlan)
    private readonly planRepo: Repository<InvestmentPlan>,
    @InjectRepository(InvestmentPurchase)
    private readonly purchaseRepo: Repository<InvestmentPurchase>,
    @InjectRepository(InvestmentSettlement)
    private readonly settlementRepo: Repository<InvestmentSettlement>,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createPlan(input: CreatePlanInput, createdBy: string): Promise<InvestmentPlan> {
    const plan = this.planRepo.create({
      ...input,
      unitsRemaining: input.totalUnits,
      createdBy,
      status: PlanStatus.DRAFT,
    });
    return this.planRepo.save(plan);
  }

  listPlans(status?: PlanStatus, cropId?: string): Promise<InvestmentPlan[]> {
    const where: any = {};
    if (status) where.status = status;
    if (cropId) where.cropId = cropId;
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findPlanById(id: string): Promise<InvestmentPlan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Investment plan ${id} not found`);
    return plan;
  }

  async updatePlan(id: string, data: Partial<InvestmentPlan>): Promise<InvestmentPlan> {
    await this.planRepo.update(id, data);
    return this.findPlanById(id);
  }

  async closePlan(id: string): Promise<InvestmentPlan> {
    return this.updatePlan(id, { status: PlanStatus.CLOSED });
  }

  async purchase(planId: string, investorId: string, units: number): Promise<InvestmentPurchase> {
    return this.dataSource.transaction(async (em) => {
      const planRepo = em.getRepository(InvestmentPlan);
      const purchaseRepo = em.getRepository(InvestmentPurchase);

      const plan = await planRepo.findOne({ where: { id: planId }, lock: { mode: 'pessimistic_write' } });
      if (!plan) throw new NotFoundException('Plan not found');
      if (plan.status !== PlanStatus.OPEN) throw new BadRequestException('Plan is not open for purchase');
      if (plan.unitsRemaining < units) throw new BadRequestException(`Only ${plan.unitsRemaining} units remaining`);

      const principal = units * plan.unitCost;
      const investorWallet = await this.walletService.getOrCreateWallet(investorId);
      const txnId = crypto.randomUUID();

      await this.walletService.debit(investorWallet.id, principal, LedgerAccount.INVESTMENT_POOL, txnId, em);

      plan.unitsRemaining -= units;
      await planRepo.save(plan);

      const maturesAt = new Date(Date.now() + plan.maturityDays * 24 * 60 * 60 * 1000);
      const purchase = await purchaseRepo.save(
        purchaseRepo.create({ planId, investorId, units, principal, status: PurchaseStatus.ACTIVE, maturesAt }),
      );

      await this.notificationsService.create(investorId, {
        title: 'Investment purchased',
        message: `You purchased ${units} unit(s) of "${plan.title}" for ${principal / 100} GHS`,
        type: NotificationType.INVESTMENT_PURCHASED,
      });

      return purchase;
    });
  }

  async settle(planId: string, actualProfitPerUnit: number, notes: string | undefined, settledBy: string): Promise<InvestmentSettlement> {
    return this.dataSource.transaction(async (em) => {
      const planRepo = em.getRepository(InvestmentPlan);
      const purchaseRepo = em.getRepository(InvestmentPurchase);

      const plan = await planRepo.findOne({ where: { id: planId }, lock: { mode: 'pessimistic_write' } });
      if (!plan) throw new NotFoundException('Plan not found');

      const purchases = await purchaseRepo.find({ where: { planId, status: PurchaseStatus.ACTIVE } });

      for (const purchase of purchases) {
        const payout = purchase.principal + purchase.units * actualProfitPerUnit;
        const investorWallet = await this.walletService.getOrCreateWallet(purchase.investorId);
        const txnId = crypto.randomUUID();

        await this.walletService.credit(investorWallet.id, Math.max(0, payout), LedgerAccount.USER_CASH, txnId, em);

        purchase.status = PurchaseStatus.SETTLED;
        purchase.payoutAmount = payout;
        purchase.settlementLedgerRef = txnId;
        await purchaseRepo.save(purchase);

        await this.notificationsService.create(purchase.investorId, {
          title: 'Investment settled',
          message: `Your investment of ${purchase.principal / 100} GHS settled with payout ${Math.max(0, payout) / 100} GHS`,
          type: NotificationType.INVESTMENT_SETTLED,
        });
      }

      plan.status = PlanStatus.SETTLED;
      await planRepo.save(plan);

      return em.getRepository(InvestmentSettlement).save(
        em.getRepository(InvestmentSettlement).create({ planId, actualProfitPerUnit, settledBy, notes: notes ?? null }),
      );
    });
  }

  myInvestments(investorId: string): Promise<InvestmentPurchase[]> {
    return this.purchaseRepo.find({ where: { investorId }, order: { purchasedAt: 'DESC' } });
  }
}
