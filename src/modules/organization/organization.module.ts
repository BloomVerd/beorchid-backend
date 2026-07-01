import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { OrganizationService } from './organization.service';
import { OrganizationResolver } from './organization.resolver';

/**
 * Organization module — multi-member organization management for corporate
 * and group accounts.
 *
 * An `Organization` is owned by a single user (`ownerUserId`). The owner can
 * invite additional members via `addOrgMember`, assigning each a role string
 * (e.g. `'owner'`, `'member'`, `'viewer'`). Only the owner may add members.
 *
 * Exports OrganizationService for use by other modules that need to resolve
 * organizational context (e.g. permission checks for company accounts).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization, OrganizationMember])],
  providers: [OrganizationService, OrganizationResolver],
  exports: [OrganizationService],
})
export class OrganizationModule {}
