import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';
import { Farmer } from '../farmer/entities/farmer.entity';
import { Deal } from '../marketplace/entities/deal.entity';
import { Offer } from '../marketplace/entities/offer.entity';
import { Listing } from '../marketplace/entities/listing.entity';
import { InvestmentPurchase, PurchaseStatus } from '../investment/entities/investment-purchase.entity';
import { CoinTransaction, CoinSide } from '../coin/entities/coin-transaction.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AdminMetrics } from './types/admin-metrics.type';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Farmer) private readonly farmerRepo: Repository<Farmer>,
    @InjectRepository(Deal) private readonly dealRepo: Repository<Deal>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Listing) private readonly listingRepo: Repository<Listing>,
    @InjectRepository(InvestmentPurchase) private readonly purchaseRepo: Repository<InvestmentPurchase>,
    @InjectRepository(CoinTransaction) private readonly coinTxnRepo: Repository<CoinTransaction>,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
  ) {}

  listUsers(): Promise<Farmer[]> {
    return this.farmerRepo.find({ order: { createdAt: 'DESC' } });
  }

  listDeals(): Promise<Deal[]> {
    return this.dealRepo.find({ order: { createdAt: 'DESC' } });
  }

  listOffers(): Promise<Offer[]> {
    return this.offerRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getMetrics(): Promise<AdminMetrics> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const pct = (curr: number, prev: number): number | null =>
      prev === 0 ? null : +((curr - prev) / prev * 100).toFixed(1);

    const [
      allDeals, activePurchases, allCoinTxns, totalListings, totalUsers,
      curDeals, prevDeals,
      curPurchases, prevPurchases,
      curCoinTxns, prevCoinTxns,
      curListings, prevListings,
      curUsers, prevUsers,
    ] = await Promise.all([
      this.dealRepo.find(),
      this.purchaseRepo.find({ where: { status: PurchaseStatus.ACTIVE } }),
      this.coinTxnRepo.find(),
      this.listingRepo.count(),
      this.farmerRepo.count(),
      this.dealRepo.find({ where: { createdAt: Between(weekAgo, now) } }),
      this.dealRepo.find({ where: { createdAt: Between(twoWeeksAgo, weekAgo) } }),
      this.purchaseRepo.find({ where: { purchasedAt: Between(weekAgo, now) } }),
      this.purchaseRepo.find({ where: { purchasedAt: Between(twoWeeksAgo, weekAgo) } }),
      this.coinTxnRepo.find({ where: { executedAt: Between(weekAgo, now) } }),
      this.coinTxnRepo.find({ where: { executedAt: Between(twoWeeksAgo, weekAgo) } }),
      this.listingRepo.count({ where: { createdAt: Between(weekAgo, now) } }),
      this.listingRepo.count({ where: { createdAt: Between(twoWeeksAgo, weekAgo) } }),
      this.farmerRepo.count({ where: { createdAt: Between(weekAgo, now) } }),
      this.farmerRepo.count({ where: { createdAt: Between(twoWeeksAgo, weekAgo) } }),
    ]);

    const gmv = allDeals.reduce((s, d) => s + Number(d.amount), 0);
    const aum = activePurchases.reduce((s, p) => s + Number(p.principal), 0);
    const activeInvestments = activePurchases.length;
    const coinVolume = allCoinTxns.filter(t => t.side === CoinSide.BUY).reduce((s, t) => s + Number(t.grossAmount), 0);
    const totalDeals = allDeals.length;

    return {
      gmv, aum, coinVolume, activeInvestments, totalListings, totalDeals, totalUsers,
      gmvDelta: pct(
        curDeals.reduce((s, d) => s + Number(d.amount), 0),
        prevDeals.reduce((s, d) => s + Number(d.amount), 0),
      ),
      aumDelta: pct(
        curPurchases.reduce((s, p) => s + Number(p.principal), 0),
        prevPurchases.reduce((s, p) => s + Number(p.principal), 0),
      ),
      coinVolumeDelta: pct(
        curCoinTxns.filter(t => t.side === CoinSide.BUY).reduce((s, t) => s + Number(t.grossAmount), 0),
        prevCoinTxns.filter(t => t.side === CoinSide.BUY).reduce((s, t) => s + Number(t.grossAmount), 0),
      ),
      activeInvestmentsDelta: pct(
        curPurchases.filter(p => p.status === PurchaseStatus.ACTIVE).length,
        prevPurchases.filter(p => p.status === PurchaseStatus.ACTIVE).length,
      ),
      totalListingsDelta: pct(curListings, prevListings),
      totalDealsDelta: pct(curDeals.length, prevDeals.length),
      totalUsersDelta: pct(curUsers, prevUsers),
    };
  }

  getAuditLog(entity?: string, from?: Date, to?: Date): Promise<AuditLog[]> {
    const where: any = {};
    if (entity) where.entity = entity;
    if (from) where.createdAt = MoreThanOrEqual(from);
    return this.auditRepo.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  async updateUserRoles(userId: string, roles: string[]): Promise<Farmer> {
    await this.farmerRepo.update(userId, { roles });
    return this.farmerRepo.findOne({ where: { id: userId } }) as Promise<Farmer>;
  }

  async suspendUser(userId: string): Promise<Farmer> {
    await this.farmerRepo.update(userId, { isActive: false } as any);
    return this.farmerRepo.findOne({ where: { id: userId } }) as Promise<Farmer>;
  }

  async grantFieldAgent(userId: string): Promise<Farmer> {
    await this.farmerRepo.update(userId, { isFieldAgent: true });
    return this.farmerRepo.findOne({ where: { id: userId } }) as Promise<Farmer>;
  }

  async revokeFieldAgent(userId: string): Promise<Farmer> {
    await this.farmerRepo.update(userId, { isFieldAgent: false });
    return this.farmerRepo.findOne({ where: { id: userId } }) as Promise<Farmer>;
  }
}
