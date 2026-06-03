import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFarmerSettings1749100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farmer_settings" (
        "id"                          UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "farmDataLookbackHours"       INTEGER       NOT NULL DEFAULT 1,
        "farmDataCacheTtlSeconds"     INTEGER       NOT NULL DEFAULT 3600,
        "healthReportIntervalHours"   INTEGER       NOT NULL DEFAULT 1,
        "predictionWeeklyLimit"       INTEGER       NOT NULL DEFAULT 3,
        "createdAt"                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "farmerId"                    UUID,
        CONSTRAINT "PK_farmer_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_farmer_settings_farmer" UNIQUE ("farmerId"),
        CONSTRAINT "FK_farmer_settings_farmer"
          FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "farmer_settings"`);
  }
}
