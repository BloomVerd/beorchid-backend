import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketTables1750800000000 implements MigrationInterface {
  name = 'CreateMarketTables1750800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "crops" (
        "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"      varchar NOT NULL UNIQUE,
        "slug"      varchar NOT NULL UNIQUE,
        "unit"      varchar NOT NULL DEFAULT 'per 100kg bag',
        "metadata"  jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "price_type_enum" AS ENUM ('farm_gate', 'wholesale', 'retail', 'auction', 'index');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "market_price_points" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cropId"              uuid NOT NULL REFERENCES "crops"("id") ON DELETE RESTRICT,
        "region"              varchar NOT NULL,
        "price"               bigint NOT NULL,
        "currency"            varchar NOT NULL DEFAULT 'GHS',
        "observedAt"          timestamptz NOT NULL,
        "source"              varchar NOT NULL,
        "sourceUrl"           varchar,
        "priceType"           price_type_enum NOT NULL,
        "volumeKg"            bigint,
        "qualityGrade"        varchar,
        "notes"               text,
        "ingestionJobId"      uuid,
        "fieldObservationId"  uuid,
        "isSuperseded"        boolean NOT NULL DEFAULT false,
        "supersededBy"        uuid,
        "createdAt"           timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("cropId", "region", "observedAt", "priceType", "source")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_mpp_crop_region_date" ON "market_price_points" ("cropId", "region", "observedAt" DESC)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_forecasts" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cropId"         uuid NOT NULL REFERENCES "crops"("id") ON DELETE RESTRICT,
        "region"         varchar NOT NULL,
        "horizonDays"    int NOT NULL,
        "predictedPrice" bigint NOT NULL,
        "confidenceLow"  bigint NOT NULL,
        "confidenceHigh" bigint NOT NULL,
        "modelVersion"   varchar NOT NULL,
        "generatedAt"    timestamptz NOT NULL,
        "createdAt"      timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "insight_type_enum" AS ENUM ('supply_demand', 'seasonality', 'volatility', 'regional_comparison', 'top_crops', 'report');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "market_survey_insights" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cropId"      uuid,
        "region"      varchar,
        "type"        insight_type_enum NOT NULL,
        "payload"     jsonb NOT NULL,
        "publishedAt" timestamptz NOT NULL,
        "authorId"    uuid NOT NULL,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "market_survey_insights"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "insight_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_forecasts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "market_price_points"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "price_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crops"`);
  }
}
