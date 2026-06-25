import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { CreateOrganizationInput } from './inputs/create-organization.input';
import { AddOrgMemberInput } from './inputs/add-org-member.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver(() => Organization)
@UseGuards(GqlJwtAuthGuard)
export class OrganizationResolver {
  constructor(private readonly organizationService: OrganizationService) {}

  @Mutation(() => Organization)
  async createOrganization(
    @Args('input') input: CreateOrganizationInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<Organization> {
    return this.organizationService.create(input.name, user.id);
  }

  @Mutation(() => OrganizationMember)
  async addOrgMember(
    @Args('input') input: AddOrgMemberInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<OrganizationMember> {
    return this.organizationService.addMember(
      input.orgId,
      input.userId,
      input.memberRole,
      user.id,
    );
  }

  @Query(() => [Organization])
  async myOrganizations(@CurrentFarmer() user: Farmer): Promise<Organization[]> {
    return this.organizationService.findByOwner(user.id);
  }
}
