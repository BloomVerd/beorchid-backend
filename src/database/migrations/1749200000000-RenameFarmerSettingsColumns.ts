import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameFarmerSettingsColumns1749200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'farmer_settings' AND column_name = 'farmDataLookbackHours'
        ) THEN
          ALTER TABLE "farmer_settings"
            RENAME COLUMN "farmDataLookbackHours" TO "farmDataLookbackSeconds";
          ALTER TABLE "farmer_settings"
            ALTER COLUMN "farmDataLookbackSeconds" SET DEFAULT 3600;
          UPDATE "farmer_settings"
            SET "farmDataLookbackSeconds" = "farmDataLookbackSeconds" * 3600;
        ELSIF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'farmer_settings' AND column_name = 'farmDataLookbackSeconds'
        ) THEN
          ALTER TABLE "farmer_settings"
            ADD COLUMN "farmDataLookbackSeconds" INTEGER NOT NULL DEFAULT 3600;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'farmer_settings' AND column_name = 'healthReportIntervalHours'
        ) THEN
          ALTER TABLE "farmer_settings"
            RENAME COLUMN "healthReportIntervalHours" TO "healthReportIntervalSeconds";
          ALTER TABLE "farmer_settings"
            ALTER COLUMN "healthReportIntervalSeconds" SET DEFAULT 3600;
          UPDATE "farmer_settings"
            SET "healthReportIntervalSeconds" = "healthReportIntervalSeconds" * 3600;
        ELSIF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'farmer_settings' AND column_name = 'healthReportIntervalSeconds'
        ) THEN
          ALTER TABLE "farmer_settings"
            ADD COLUMN "healthReportIntervalSeconds" INTEGER NOT NULL DEFAULT 3600;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'farmer_settings' AND column_name = 'healthReportIntervalSeconds'
        ) THEN
          UPDATE "farmer_settings"
            SET "healthReportIntervalSeconds" = "healthReportIntervalSeconds" / 3600;
          ALTER TABLE "farmer_settings"
            ALTER COLUMN "healthReportIntervalSeconds" SET DEFAULT 1;
          ALTER TABLE "farmer_settings"
            RENAME COLUMN "healthReportIntervalSeconds" TO "healthReportIntervalHours";
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'farmer_settings' AND column_name = 'farmDataLookbackSeconds'
        ) THEN
          UPDATE "farmer_settings"
            SET "farmDataLookbackSeconds" = "farmDataLookbackSeconds" / 3600;
          ALTER TABLE "farmer_settings"
            ALTER COLUMN "farmDataLookbackSeconds" SET DEFAULT 1;
          ALTER TABLE "farmer_settings"
            RENAME COLUMN "farmDataLookbackSeconds" TO "farmDataLookbackHours";
        END IF;
      END $$
    `);
  }
}
