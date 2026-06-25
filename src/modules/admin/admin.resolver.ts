import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminMetrics } from './types/admin-metrics.type';
import { Farmer } from '../farmer/entities/farmer.entity';
import { Deal } from '../marketplace/entities/deal.entity';
import { Offer } from '../marketplace/entities/offer.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';

@Resolver()
@UseGuards(GqlJwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminResolver {
  constructor(private readonly adminService: AdminService) {}

  @Query(() => [Farmer])
  adminUsers(): Promise<Farmer[]> {
    return this.adminService.listUsers();
  }

  @Query(() => [Deal])
  adminDeals(): Promise<Deal[]> {
    return this.adminService.listDeals();
  }

  @Query(() => [Offer])
  adminOffers(): Promise<Offer[]> {
    return this.adminService.listOffers();
  }

  @Query(() => AdminMetrics)
  adminMetrics(): Promise<AdminMetrics> {
    return this.adminService.getMetrics();
  }

  @Query(() => [AuditLog])
  auditLog(
    @Args('entity', { nullable: true }) entity?: string,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
  ): Promise<AuditLog[]> {
    return this.adminService.getAuditLog(entity, from, to);
  }

  @Mutation(() => Farmer)
  updateUserRoles(
    @Args('userId', { type: () => ID }) userId: string,
    @Args('roles', { type: () => [String] }) roles: string[],
  ): Promise<Farmer> {
    return this.adminService.updateUserRoles(userId, roles);
  }

  @Mutation(() => Farmer)
  suspendUser(@Args('userId', { type: () => ID }) userId: string): Promise<Farmer> {
    return this.adminService.suspendUser(userId);
  }

  @Mutation(() => Farmer)
  grantFieldAgent(@Args('userId', { type: () => ID }) userId: string): Promise<Farmer> {
    return this.adminService.grantFieldAgent(userId);
  }

  @Mutation(() => Farmer)
  revokeFieldAgent(@Args('userId', { type: () => ID }) userId: string): Promise<Farmer> {
    return this.adminService.revokeFieldAgent(userId);
  }
}
