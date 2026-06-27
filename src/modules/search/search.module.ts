import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from '../marketplace/entities/listing.entity';
import { Coin } from '../coin/entities/coin.entity';
import { InvestmentPlan } from '../investment/entities/investment-plan.entity';
import { Crop } from '../market/entities/crop.entity';
import { SearchService } from './search.service';
import { SearchResolver } from './search.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, Coin, InvestmentPlan, Crop])],
  providers: [SearchService, SearchResolver],
})
export class SearchModule {}
