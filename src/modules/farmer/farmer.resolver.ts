import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FarmerService } from './farmer.service';
import { Farmer } from './entities/farmer.entity';
import { AdminCreateUserInput } from './inputs/admin-create-user.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';

/**
 * GraphQL resolver for farmer account operations. `getMe` is available to any
 * authenticated farmer; `adminCreateUser` requires the `super_admin` role.
 */
@Resolver(() => Farmer)
export class FarmerResolver {
  constructor(private readonly farmerService: FarmerService) {}

  /** Returns the full profile of the authenticated farmer. */
  @Query(() => Farmer)
  @UseGuards(GqlJwtAuthGuard)
  getMe(@CurrentFarmer() farmer: Farmer) {
    return this.farmerService.findById(farmer.id);
  }

  /** Creates a farmer account from the admin panel. Requires `super_admin` role. */
  @Mutation(() => Farmer)
  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  adminCreateUser(@Args('input') input: AdminCreateUserInput): Promise<Farmer> {
    return this.farmerService.adminCreateUser(input);
  }
}
