import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
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
    const deals = await this.dealRepo.find();
    const gmv = deals.reduce((s, d) => s + Number(d.amount), 0);

    const purchases = await this.purchaseRepo.find({ where: { status: PurchaseStatus.ACTIVE } });
    const aum = purchases.reduce((s, p) => s + Number(p.principal), 0);
    const activeInvestments = purchases.length;

    const coinTxns = await this.coinTxnRepo.find();
    const coinVolume = coinTxns
      .filter(t => t.side === CoinSide.BUY)
      .reduce((s, t) => s + Number(t.grossAmount), 0);

    const totalListings = await this.listingRepo.count();
    const totalDeals = deals.length;
    const totalUsers = await this.farmerRepo.count();

    return { gmv, aum, coinVolume, activeInvestments, totalListings, totalDeals, totalUsers };
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
