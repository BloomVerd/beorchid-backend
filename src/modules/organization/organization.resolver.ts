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

/**
 * GraphQL resolver for organization and membership operations. All queries and
 * mutations require a valid JWT. Organization creation is open to any
 * authenticated user; member management is enforced at the service level
 * (only the org owner may add members).
 */
@Resolver(() => Organization)
@UseGuards(GqlJwtAuthGuard)
export class OrganizationResolver {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * Creates a new organization owned by the authenticated user. The owner is
   * automatically added as a member with the `'owner'` role.
   */
  @Mutation(() => Organization)
  async createOrganization(
    @Args('input') input: CreateOrganizationInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<Organization> {
    return this.organizationService.create(input.name, user.id);
  }

  /**
   * Adds a member to an organization. Only the organization owner may perform
   * this action; non-owners receive a 403.
   */
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

  /** Returns all organizations owned by the authenticated user with their members loaded. */
  @Query(() => [Organization])
  async myOrganizations(@CurrentFarmer() user: Farmer): Promise<Organization[]> {
    return this.organizationService.findByOwner(user.id);
  }
}
