import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>,
  ) {}

  async create(name: string, ownerUserId: string): Promise<Organization> {
    const org = this.orgRepo.create({ name, ownerUserId });
    const saved = await this.orgRepo.save(org);
    await this.memberRepo.save(
      this.memberRepo.create({ orgId: saved.id, userId: ownerUserId, memberRole: 'owner' }),
    );
    return saved;
  }

  async addMember(orgId: string, userId: string, memberRole: string, requesterId: string): Promise<OrganizationMember> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    if (org.ownerUserId !== requesterId) throw new ForbiddenException('Only the org owner can add members');

    const member = this.memberRepo.create({ orgId, userId, memberRole });
    return this.memberRepo.save(member);
  }

  async findByOwner(ownerUserId: string): Promise<Organization[]> {
    return this.orgRepo.find({ where: { ownerUserId }, relations: ['members'] });
  }

  async findById(id: string): Promise<Organization | null> {
    return this.orgRepo.findOne({ where: { id }, relations: ['members'] });
  }
}
