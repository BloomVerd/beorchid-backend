import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIotJobsSupport1749300000000 implements MigrationInterface {
  name = 'AddIotJobsSupport1749300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'iot_tool_call_status_enum') THEN
          ALTER TYPE "iot_tool_call_status_enum" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
        ELSE
          CREATE TYPE "iot_tool_call_status_enum" AS ENUM (
            'PENDING',
            'IN_PROGRESS',
            'COMPLETED',
            'FAILED'
          );
        END IF;
      END $$
    `);

    await queryRunner.query(
      `ALTER TABLE "iot_devices" ADD COLUMN IF NOT EXISTS "thing_arn" CHARACTER VARYING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "iot_devices" DROP COLUMN IF EXISTS "thing_arn"`,
    );
    // PostgreSQL does not support removing enum values; the IN_PROGRESS value remains
  }
}
