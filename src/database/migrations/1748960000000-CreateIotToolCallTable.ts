import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIotToolCallTable1748960000000 implements MigrationInterface {
  name = 'CreateIotToolCallTable1748960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'iot_command_type_enum') THEN
          CREATE TYPE "iot_command_type_enum" AS ENUM (
            'IRRIGATE',
            'STOP_IRRIGATION',
            'CAPTURE_IMAGE',
            'ACTIVATE_SENSOR',
            'DEACTIVATE_SENSOR'
          );
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'iot_tool_call_status_enum') THEN
          CREATE TYPE "iot_tool_call_status_enum" AS ENUM (
            'PENDING',
            'COMPLETED',
            'FAILED'
          );
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "iot_tool_calls" (
        "id"           UUID                          NOT NULL DEFAULT uuid_generate_v4(),
        "command_type" "iot_command_type_enum"       NOT NULL,
        "parameters"   JSONB                                  NULL,
        "status"       "iot_tool_call_status_enum"   NOT NULL DEFAULT 'PENDING',
        "response"     JSONB                                  NULL,
        "requested_by" CHARACTER VARYING             NOT NULL,
        "iotDeviceId"  UUID                                   NULL,
        "createdAt"    TIMESTAMP                     NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP                     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_iot_tool_calls" PRIMARY KEY ("id"),
        CONSTRAINT "FK_iot_tool_calls_iot_device"
          FOREIGN KEY ("iotDeviceId") REFERENCES "iot_devices"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "iot_tool_calls"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "iot_tool_call_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "iot_command_type_enum"`);
  }
}
