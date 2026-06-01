import { Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FarmerService } from './farmer.service';
import { Farmer } from './entities/farmer.entity';
import { GqlJwtAuthGuard } from 'common/guards';
import { CurrentFarmer } from 'common/decorators';

@Resolver(() => Farmer)
export class FarmerResolver {
  constructor(private readonly farmerService: FarmerService) {}

  @Query(() => Farmer)
  @UseGuards(GqlJwtAuthGuard)
  getMe(@CurrentFarmer() farmer: Farmer) {
    return this.farmerService.findById(farmer.id);
  }
}
