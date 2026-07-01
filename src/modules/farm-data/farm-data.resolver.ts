import { Args, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FarmDataService } from './farm-data.service';
import { FarmDataResult } from './types/farm-data.types';
import { GqlJwtAuthGuard } from 'src/common/guards';

/**
 * GraphQL resolver for farm dashboard data. Exposes a single query that
 * triggers the read-through cache pattern in `FarmDataService`.
 */
@Resolver()
export class FarmDataResolver {
  constructor(private readonly farmDataService: FarmDataService) {}

  /**
   * Returns cached dashboard data (status `READY`) or enqueues generation
   * and returns `{ status: PENDING }`. Poll until `READY`.
   */
  @Query(() => FarmDataResult)
  @UseGuards(GqlJwtAuthGuard)
  getFarmData(@Args('farmId') farmId: string): Promise<FarmDataResult> {
    return this.farmDataService.getFarmData(farmId);
  }
}
