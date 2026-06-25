import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogTable1750600000000 implements MigrationInterface {
  name = 'CreateAuditLogTable1750600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actorId"   uuid NOT NULL,
        "action"    varchar NOT NULL,
        "entity"    varchar NOT NULL,
        "entityId"  varchar NOT NULL,
        "diff"      jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_logs" ("entity", "entityId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_audit_actor"  ON "audit_logs" ("actorId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
