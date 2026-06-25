import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(
    actorId: string,
    action: string,
    entity: string,
    entityId: string,
    diff?: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({ actorId, action, entity, entityId, diff: diff ?? null }),
    );
  }
}
