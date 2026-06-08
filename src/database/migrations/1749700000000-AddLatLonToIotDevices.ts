import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLatLonToIotDevices1749700000000 implements MigrationInterface {
  name = 'AddLatLonToIotDevices1749700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "iot_devices"
        ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION NULL,
        ADD COLUMN IF NOT EXISTS "lon" DOUBLE PRECISION NULL
    `);

    await queryRunner.query(`
      UPDATE "iot_devices" d
      SET "lat" = f."lat", "lon" = f."lon"
      FROM "farms" f
      WHERE d."farmId" = f."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "iot_devices"
        DROP COLUMN IF EXISTS "lat",
        DROP COLUMN IF EXISTS "lon"
    `);
  }
}
