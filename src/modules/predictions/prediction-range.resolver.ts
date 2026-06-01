import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PredictionRangeService } from './prediction-range.service';
import { PredictionRange } from './entities/prediction-range.entity';
import { GqlJwtAuthGuard } from 'common/guards';
import { CurrentFarmer } from 'common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver()
export class PredictionRangeResolver {
  constructor(private readonly predictionRangeService: PredictionRangeService) {}

  @Mutation(() => PredictionRange)
  @UseGuards(GqlJwtAuthGuard)
  createPredictionRange(
    @Args('farmId') farmId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.predictionRangeService.createPredictionRange(farmer.id, farmId);
  }
}
