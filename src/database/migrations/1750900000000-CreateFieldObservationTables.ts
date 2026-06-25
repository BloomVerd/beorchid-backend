import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFieldObservationTables1750900000000 implements MigrationInterface {
  name = 'CreateFieldObservationTables1750900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "field_price_type_enum"
        AS ENUM ('farm_gate', 'wholesale', 'retail', 'auction')
    `);
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "quality_grade_enum"
        AS ENUM ('A', 'B', 'C', 'ungraded')
    `);
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "observation_confidence_enum"
        AS ENUM ('low', 'medium', 'high')
    `);
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "observation_status_enum"
        AS ENUM ('submitted', 'under_review', 'approved', 'rejected')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "field_observations" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cropId"              uuid NOT NULL,
        "region"              varchar NOT NULL,
        "observedAt"          timestamptz NOT NULL,
        "observedPrice"       bigint NOT NULL,
        "priceType"           field_price_type_enum NOT NULL,
        "quantityAvailable"   numeric,
        "qualityGrade"        quality_grade_enum,
        "sourceNote"          text NOT NULL,
        "agentId"             uuid NOT NULL,
        "agentDeviceId"       varchar,
        "attachmentUrls"      text[] NOT NULL DEFAULT '{}',
        "conditionTags"       text[] NOT NULL DEFAULT '{}',
        "confidence"          observation_confidence_enum NOT NULL,
        "status"              observation_status_enum NOT NULL DEFAULT 'submitted',
        "reviewedBy"          uuid,
        "reviewNote"          text,
        "reviewedAt"          timestamptz,
        "marketPricePointId"  uuid,
        "createdAt"           timestamptz NOT NULL DEFAULT now(),
        "updatedAt"           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fo_agent" ON "field_observations" ("agentId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fo_status" ON "field_observations" ("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "field_agent_capabilities" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"     uuid NOT NULL,
        "grantedBy"  uuid NOT NULL,
        "grantedAt"  timestamptz NOT NULL DEFAULT now(),
        "revokedAt"  timestamptz
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "field_agent_capabilities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "field_observations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "observation_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "observation_confidence_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "quality_grade_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "field_price_type_enum"`);
  }
}
