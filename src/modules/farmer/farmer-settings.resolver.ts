import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FarmerSettingsService } from './farmer-settings.service';
import { FarmerSettings } from './entities/farmer-settings.entity';
import { UpdateFarmerSettingsInput } from './inputs/update-farmer-settings.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from './entities/farmer.entity';

/**
 * GraphQL resolver for farmer notification and pipeline settings. All operations
 * are scoped to the authenticated farmer via `@CurrentFarmer()`.
 */
@Resolver(() => FarmerSettings)
export class FarmerSettingsResolver {
  constructor(private readonly farmerSettingsService: FarmerSettingsService) {}

  /** Returns (or creates) the authenticated farmer's settings row. */
  @Query(() => FarmerSettings)
  @UseGuards(GqlJwtAuthGuard)
  getMySettings(@CurrentFarmer() farmer: Farmer): Promise<FarmerSettings> {
    return this.farmerSettingsService.getOrCreate(farmer.id);
  }

  /** Partially updates the farmer's notification toggles, SMS number, or pipeline intervals. */
  @Mutation(() => FarmerSettings)
  @UseGuards(GqlJwtAuthGuard)
  updateSettings(
    @Args('input') input: UpdateFarmerSettingsInput,
    @CurrentFarmer() farmer: Farmer,
  ): Promise<FarmerSettings> {
    return this.farmerSettingsService.update(farmer.id, input);
  }
}
