import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';

/**
 * Service for organization and membership management.
 *
 * On creation the owner is automatically added as a member with the `'owner'`
 * role. Only the organization owner (`ownerUserId`) may add further members —
 * attempting to add members as a non-owner throws `ForbiddenException`.
 */
@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>,
  ) {}

  /**
   * Creates a new organization owned by `ownerUserId` and automatically adds
   * the owner as an `'owner'`-role member.
   */
  async create(name: string, ownerUserId: string): Promise<Organization> {
    const org = this.orgRepo.create({ name, ownerUserId });
    const saved = await this.orgRepo.save(org);
    await this.memberRepo.save(
      this.memberRepo.create({ orgId: saved.id, userId: ownerUserId, memberRole: 'owner' }),
    );
    return saved;
  }

  /**
   * Adds a user to an organization with the given role. Only the organization
   * owner (`requesterId === org.ownerUserId`) may perform this action.
   *
   * @throws NotFoundException  if the organization does not exist
   * @throws ForbiddenException if the requester is not the org owner
   */
  async addMember(orgId: string, userId: string, memberRole: string, requesterId: string): Promise<OrganizationMember> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.ownerUserId !== requesterId) throw new ForbiddenException('Only the org owner can add members');

    const member = this.memberRepo.create({ orgId, userId, memberRole });
    return this.memberRepo.save(member);
  }

  /** Returns all organizations owned by the given user, with their members loaded. */
  async findByOwner(ownerUserId: string): Promise<Organization[]> {
    return this.orgRepo.find({ where: { ownerUserId }, relations: ['members'] });
  }

  /** Returns a single organization by ID with members loaded, or null if not found. */
  async findById(id: string): Promise<Organization | null> {
    return this.orgRepo.findOne({ where: { id }, relations: ['members'] });
  }
}
