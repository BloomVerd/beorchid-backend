import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIngestionTables1751000000000 implements MigrationInterface {
  name = 'CreateIngestionTables1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "ingestion_job_type_enum"
        AS ENUM ('csv_upload', 'json_upload', 'external_feed_run', 'forecast_import')
    `);
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "ingestion_job_status_enum"
        AS ENUM ('pending', 'processing', 'completed', 'failed', 'partial')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "data_ingestion_jobs" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type"           ingestion_job_type_enum NOT NULL,
        "feedId"         uuid,
        "submittedBy"    uuid NOT NULL,
        "status"         ingestion_job_status_enum NOT NULL DEFAULT 'pending',
        "rowCount"       int,
        "processedCount" int NOT NULL DEFAULT 0,
        "skippedCount"   int NOT NULL DEFAULT 0,
        "errorCount"     int NOT NULL DEFAULT 0,
        "errors"         jsonb,
        "storageRef"     text,
        "startedAt"      timestamptz,
        "completedAt"    timestamptz,
        "createdAt"      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "feed_format_enum" AS ENUM ('json', 'csv')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "external_feeds" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"          varchar NOT NULL,
        "url"           text NOT NULL,
        "format"        feed_format_enum NOT NULL,
        "fieldMap"      jsonb NOT NULL,
        "cropId"        uuid,
        "region"        varchar,
        "priceType"     varchar NOT NULL,
        "sourceLabel"   varchar NOT NULL,
        "scheduleCron"  varchar NOT NULL,
        "isActive"      boolean NOT NULL DEFAULT true,
        "lastRunAt"     timestamptz,
        "lastRunStatus" varchar,
        "createdBy"     uuid NOT NULL,
        "createdAt"     timestamptz NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "external_feeds"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "feed_format_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "data_ingestion_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ingestion_job_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ingestion_job_type_enum"`);
  }
}
