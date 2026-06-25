import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farmer } from '../farmer/entities/farmer.entity';
import { Deal } from '../marketplace/entities/deal.entity';
import { Offer } from '../marketplace/entities/offer.entity';
import { Listing } from '../marketplace/entities/listing.entity';
import { InvestmentPurchase } from '../investment/entities/investment-purchase.entity';
import { CoinTransaction } from '../coin/entities/coin-transaction.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AdminService } from './admin.service';
import { AdminResolver } from './admin.resolver';
import { AdminSeedService } from './admin-seed.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Farmer,
      Deal,
      Offer,
      Listing,
      InvestmentPurchase,
      CoinTransaction,
      AuditLog,
    ]),
    EmailModule,
  ],
  providers: [AdminService, AdminResolver, AdminSeedService],
  exports: [AdminSeedService],
})
export class AdminModule {}
