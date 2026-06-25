import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentPlan } from './entities/investment-plan.entity';
import { InvestmentPurchase } from './entities/investment-purchase.entity';
import { InvestmentSettlement } from './entities/investment-settlement.entity';
import { InvestmentService } from './investment.service';
import { InvestmentResolver } from './investment.resolver';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InvestmentPlan, InvestmentPurchase, InvestmentSettlement]),
    WalletModule,
    NotificationsModule,
  ],
  providers: [InvestmentService, InvestmentResolver],
  exports: [InvestmentService],
})
export class InvestmentModule {}
