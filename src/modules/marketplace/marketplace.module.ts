import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from './entities/listing.entity';
import { Offer } from './entities/offer.entity';
import { Deal } from './entities/deal.entity';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceResolver } from './marketplace.resolver';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Listing, Offer, Deal]),
    WalletModule,
    NotificationsModule,
  ],
  providers: [MarketplaceService, MarketplaceResolver],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
