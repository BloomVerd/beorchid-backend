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

/**
 * GraphQL resolver for the admin module. Every query and mutation requires a
 * valid JWT and the `super_admin` role — both guards are applied at the class
 * level so no individual operation can be accidentally left unprotected.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminResolver {
  constructor(private readonly adminService: AdminService) {}

  // ── Queries ──────────────────────────────────────────────────────────────────

  /** Returns all registered users ordered by creation date descending. */
  @Query(() => [Farmer])
  adminUsers(): Promise<Farmer[]> {
    return this.adminService.listUsers();
  }

  /** Returns all deals on the platform ordered by creation date descending. */
  @Query(() => [Deal])
  adminDeals(): Promise<Deal[]> {
    return this.adminService.listDeals();
  }

  /** Returns all offers on the platform ordered by creation date descending. */
  @Query(() => [Offer])
  adminOffers(): Promise<Offer[]> {
    return this.adminService.listOffers();
  }

  /** Returns aggregate platform KPIs with week-over-week percentage deltas. */
  @Query(() => AdminMetrics)
  adminMetrics(): Promise<AdminMetrics> {
    return this.adminService.getMetrics();
  }

  /** Returns up to 200 recent audit log entries, optionally filtered by entity type and date range. */
  @Query(() => [AuditLog])
  auditLog(
    @Args('entity', { nullable: true }) entity?: string,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
  ): Promise<AuditLog[]> {
    return this.adminService.getAuditLog(entity, from, to);
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  /** Replaces the role array on the given user and returns the updated record. */
  @Mutation(() => Farmer)
  updateUserRoles(
    @Args('userId', { type: () => ID }) userId: string,
    @Args('roles', { type: () => [String] }) roles: string[],
  ): Promise<Farmer> {
    return this.adminService.updateUserRoles(userId, roles);
  }

  /** Deactivates a user account (`isActive = false`). */
  @Mutation(() => Farmer)
  suspendUser(@Args('userId', { type: () => ID }) userId: string): Promise<Farmer> {
    return this.adminService.suspendUser(userId);
  }

  /** Grants the field-agent flag to a user. */
  @Mutation(() => Farmer)
  grantFieldAgent(@Args('userId', { type: () => ID }) userId: string): Promise<Farmer> {
    return this.adminService.grantFieldAgent(userId);
  }

  /** Revokes the field-agent flag from a user. */
  @Mutation(() => Farmer)
  revokeFieldAgent(@Args('userId', { type: () => ID }) userId: string): Promise<Farmer> {
    return this.adminService.revokeFieldAgent(userId);
  }
}
