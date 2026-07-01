import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from '../marketplace/entities/listing.entity';
import { Coin } from '../coin/entities/coin.entity';
import { InvestmentPlan } from '../investment/entities/investment-plan.entity';
import { Crop } from '../market/entities/crop.entity';
import { SearchService } from './search.service';
import { SearchResolver } from './search.resolver';

/**
 * Search module — cross-entity full-text search across listings, coins,
 * investment plans, and crops.
 *
 * Runs four parallel `ILike` queries against the relevant name/description
 * fields and returns aggregated results as a single `SearchResults` object.
 * Results per entity type are capped at `min(limit, 20)` (default: 5).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Listing, Coin, InvestmentPlan, Crop])],
  providers: [SearchService, SearchResolver],
})
export class SearchModule {}
