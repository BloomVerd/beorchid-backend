import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

/**
 * Write-only service for appending audit log entries.
 *
 * Each entry records who did what to which entity and an optional diff payload.
 * Records are never updated or deleted — the table is an append-only trail.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Appends an immutable audit log entry.
   *
   * @param actorId  ID of the user performing the action
   * @param action   Verb describing the action (e.g. `"UPDATE_ROLES"`)
   * @param entity   Name of the affected entity type (e.g. `"Farmer"`)
   * @param entityId Primary key of the affected record
   * @param diff     Optional before/after snapshot or change payload
   */
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
