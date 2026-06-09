import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationPrefsToFarmerSettings1750000000000
  implements MigrationInterface
{
  name = 'AddNotificationPrefsToFarmerSettings1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "farmer_settings"
        ADD COLUMN IF NOT EXISTS "notifyInApp"     boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "notifyEmail"     boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "notifySms"       boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "smsPhoneNumber"  varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "farmer_settings"
        DROP COLUMN IF EXISTS "notifyInApp",
        DROP COLUMN IF EXISTS "notifyEmail",
        DROP COLUMN IF EXISTS "notifySms",
        DROP COLUMN IF EXISTS "smsPhoneNumber"
    `);
  }
}
