import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusToIotDevices1749800000000 implements MigrationInterface {
  name = 'AddStatusToIotDevices1749800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'iot_devices_status_enum') THEN
          CREATE TYPE "iot_devices_status_enum" AS ENUM ('ONLINE', 'OFFLINE', 'INACTIVE');
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "iot_devices"
        ADD COLUMN IF NOT EXISTS "status" "iot_devices_status_enum" NOT NULL DEFAULT 'INACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "iot_devices" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "iot_devices_status_enum"`);
  }
}
