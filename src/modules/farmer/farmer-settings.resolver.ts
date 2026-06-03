import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FarmerSettingsService } from './farmer-settings.service';
import { FarmerSettings } from './entities/farmer-settings.entity';
import { UpdateFarmerSettingsInput } from './inputs/update-farmer-settings.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from './entities/farmer.entity';

@Resolver(() => FarmerSettings)
export class FarmerSettingsResolver {
  constructor(private readonly farmerSettingsService: FarmerSettingsService) {}

  @Query(() => FarmerSettings)
  @UseGuards(GqlJwtAuthGuard)
  getMySettings(@CurrentFarmer() farmer: Farmer): Promise<FarmerSettings> {
    return this.farmerSettingsService.getOrCreate(farmer.id);
  }

  @Mutation(() => FarmerSettings)
  @UseGuards(GqlJwtAuthGuard)
  updateSettings(
    @Args('input') input: UpdateFarmerSettingsInput,
    @CurrentFarmer() farmer: Farmer,
  ): Promise<FarmerSettings> {
    return this.farmerSettingsService.update(farmer.id, input);
  }
}
