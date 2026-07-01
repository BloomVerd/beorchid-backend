import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, DataSource, ILike, LessThanOrEqual, Not, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { InvestmentPlan, PlanStatus } from './entities/investment-plan.entity';
import { InvestmentPurchase, PurchaseStatus } from './entities/investment-purchase.entity';
import { InvestmentSettlement } from './entities/investment-settlement.entity';
import { CreatePlanInput } from './inputs/create-plan.input';
import { WalletService } from '../wallet/wallet.service';
import { LedgerAccount } from '../wallet/entities/ledger-entry.entity';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { NotificationType } from '../notifications/entities/notification.entity';

/**
 * Service for farm investment plan management. Handles plan lifecycle
 * (DRAFT → OPEN → CLOSED → SETTLED), investor unit purchases, and atomic
 * settlement payouts.
 *
 * All monetary values are in pesewas (GHS × 100).
 *
 * Payout formula: `principal + (units × actualProfitPerUnit)`, clamped to ≥ 0.
 */
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
    private readonly notificationsProducer: NotificationsProducer,
  ) {}

  /**
   * Creates a new investment plan in DRAFT status. `unitsRemaining` is
   * initialised to `totalUnits` and the plan is not visible to investors until
   * `openPlan` is called.
   */
  async createPlan(input: CreatePlanInput, createdBy: string): Promise<InvestmentPlan> {
    const plan = this.planRepo.create({
      ...input,
      unitsRemaining: input.totalUnits,
      createdBy,
      status: PlanStatus.DRAFT,
    });
    return this.planRepo.save(plan);
  }

  /**
   * Lists plans with optional filters. `lowRiskOnly` excludes plans whose
   * free-text `riskNotes` field contains "high", "moderate", or "medium" using
   * a SQL ILIKE text search — plans without `riskNotes` always pass through.
   */
  listPlans(status?: PlanStatus, cropId?: string, maxMaturityDays?: number, lowRiskOnly?: boolean): Promise<InvestmentPlan[]> {
    const where: any = {};
    if (status) where.status = status;
    if (cropId) where.cropId = cropId;
    if (maxMaturityDays != null) where.maturityDays = LessThanOrEqual(maxMaturityDays);
    if (lowRiskOnly) where.riskNotes = And(Not(ILike('%high%')), Not(ILike('%moderate%')), Not(ILike('%medium%')));
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Returns a single plan by ID. Throws 404 if not found. */
  async findPlanById(id: string): Promise<InvestmentPlan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Investment plan ${id} not found`);
    return plan;
  }

  /** Applies a partial update to a plan and returns the refreshed record. */
  async updatePlan(id: string, data: Partial<InvestmentPlan>): Promise<InvestmentPlan> {
    await this.planRepo.update(id, data);
    return this.findPlanById(id);
  }

  /**
   * Transitions a plan from DRAFT to OPEN, making it purchasable by investors.
   *
   * @throws BadRequestException if the plan is not in DRAFT status
   */
  async openPlan(id: string): Promise<InvestmentPlan> {
    const plan = await this.findPlanById(id);
    if (plan.status !== PlanStatus.DRAFT)
      throw new BadRequestException('Only draft plans can be opened');
    return this.updatePlan(id, { status: PlanStatus.OPEN });
  }

  /** Closes a plan to new purchases. Existing active purchases are unaffected. */
  async closePlan(id: string): Promise<InvestmentPlan> {
    return this.updatePlan(id, { status: PlanStatus.CLOSED });
  }

  /**
   * Purchases units in an open plan. Runs inside a transaction with a
   * pessimistic write lock on the plan to prevent overselling. Steps:
   *  1. Validates the plan is OPEN with sufficient units remaining.
   *  2. Debits `units × unitCost` from the investor's wallet to INVESTMENT_POOL.
   *  3. Decrements `plan.unitsRemaining`.
   *  4. Creates an ACTIVE `InvestmentPurchase` with a calculated `maturesAt`.
   *  5. Notifies the investor.
   *
   * @throws NotFoundException   if the plan does not exist
   * @throws BadRequestException if the plan is not OPEN or has insufficient units
   */
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

      await this.notificationsProducer.notify(investorId, {
        title: 'Investment purchased',
        message: `You purchased ${units} unit(s) of "${plan.title}" for ${principal / 100} GHS`,
        type: NotificationType.INVESTMENT_PURCHASED,
      });

      return purchase;
    });
  }

  /**
   * Settles a plan by paying out all ACTIVE purchases in a single transaction.
   * For each purchase:
   *  - payout = `principal + (units × actualProfitPerUnit)`, clamped to ≥ 0
   *  - Investor wallet credited (payout) to USER_CASH
   *  - Purchase marked SETTLED with `payoutAmount` and `settlementLedgerRef`
   *  - Investor notified
   *
   * After all purchases are settled the plan moves to SETTLED status and an
   * `InvestmentSettlement` audit record is created.
   *
   * @throws NotFoundException if the plan does not exist
   */
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

        await this.notificationsProducer.notify(purchase.investorId, {
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

  /** Returns all purchases made by the given investor, ordered by purchase date descending. */
  myInvestments(investorId: string): Promise<InvestmentPurchase[]> {
    return this.purchaseRepo.find({ where: { investorId }, order: { purchasedAt: 'DESC' } });
  }
}
