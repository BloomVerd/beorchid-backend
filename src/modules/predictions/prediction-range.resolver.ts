import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PredictionRangeService } from './prediction-range.service';
import { PredictionRange } from './entities/prediction-range.entity';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for prediction range management. Exposes a single mutation
 * to explicitly create a range for the current week (used by admin/testing flows;
 * normal generation creates ranges implicitly via `PredictionService`).
 */
@Resolver()
export class PredictionRangeResolver {
  constructor(
    private readonly predictionRangeService: PredictionRangeService,
  ) {}

  /** Creates a prediction range for the current ISO week. Fails if one already exists. */
  @Mutation(() => PredictionRange)
  @UseGuards(GqlJwtAuthGuard)
  createPredictionRange(
    @Args('farmId') farmId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.predictionRangeService.createPredictionRange(farmer.id, farmId);
  }
}
