import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PredictionService } from './prediction.service';
import { GenerateFarmPredictionResponse } from './types/generate-farm-prediction-response';
import { PaginatedPredictions } from './types/paginated-predictions';
import { GqlJwtAuthGuard } from 'common/guards';
import { CurrentFarmer } from 'common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver()
export class PredictionResolver {
  constructor(private readonly predictionService: PredictionService) {}

  @Mutation(() => GenerateFarmPredictionResponse)
  @UseGuards(GqlJwtAuthGuard)
  generateFarmPredictions(
    @Args('farmId') farmId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.predictionService.generateFarmPredictions(farmer.email, farmId);
  }

  @Query(() => PaginatedPredictions)
  @UseGuards(GqlJwtAuthGuard)
  listFarmPredictions(
    @Args('farmId') farmId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @Args('year', { type: () => Int, nullable: true }) year: number | null,
    @Args('month', { type: () => Int, nullable: true }) month: number | null,
    @Args('week', { type: () => Int, nullable: true }) week: number | null,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.predictionService.listFarmPredictions(
      farmer.id,
      farmId,
      page,
      limit,
      year ?? undefined,
      month ?? undefined,
      week ?? undefined,
    );
  }
}
