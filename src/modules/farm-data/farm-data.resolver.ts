import { Args, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FarmDataService } from './farm-data.service';
import { FarmDataResult } from './types/farm-data.types';
import { GqlJwtAuthGuard } from 'src/common/guards';

@Resolver()
export class FarmDataResolver {
  constructor(private readonly farmDataService: FarmDataService) {}

  @Query(() => FarmDataResult)
  @UseGuards(GqlJwtAuthGuard)
  getFarmData(@Args('farmId') farmId: string): Promise<FarmDataResult> {
    return this.farmDataService.getFarmData(farmId);
  }
}
