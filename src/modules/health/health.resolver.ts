import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { HealthService } from './health.service';
import { FarmHealth } from './entities/farm-health.entity';
import { PaginatedFarmHealthSummaries } from './types/health.types';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver(() => FarmHealth)
export class HealthResolver {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Returns a paginated list of all farms with their latest precomputed
   * health summary (scores + top alert). Used by the /health overview page.
   */
  @Query(() => PaginatedFarmHealthSummaries)
  @UseGuards(GqlJwtAuthGuard)
  listFarmsHealth(
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.healthService.listFarmsHealth(farmer.id, page, limit);
  }

  /**
   * Returns the full precomputed health report for a single farm, including
   * crop field health, disease alerts, health alerts, sensor history, and
   * yield comparisons. Used by the /health/[farmId] detail page.
   */
  @Query(() => FarmHealth)
  @UseGuards(GqlJwtAuthGuard)
  getFarmHealth(
    @Args('farmId') farmId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.healthService.getFarmHealth(farmer.id, farmId);
  }
}
