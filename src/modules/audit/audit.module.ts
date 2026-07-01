/**
 * Audit module — provides `AuditService` for writing immutable action records.
 *
 * Import this module wherever an audit trail is required. The module has no
 * resolver of its own; audit log entries are exposed read-only via the Admin
 * module's `auditLog` query.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
