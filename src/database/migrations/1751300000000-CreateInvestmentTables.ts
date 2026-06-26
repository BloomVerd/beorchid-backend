import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvestmentTables1751300000000 implements MigrationInterface {
  name = 'CreateInvestmentTables1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "plan_status_enum" AS ENUM ('draft', 'open', 'closed', 'matured', 'settled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "investment_plans" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cropId"           uuid,
        "title"            varchar NOT NULL,
        "acreage"          numeric,
        "unitCost"         bigint NOT NULL,
        "expectedProfitMin" bigint NOT NULL,
        "expectedProfitMax" bigint NOT NULL,
        "maturityDays"     int NOT NULL,
        "totalUnits"       int NOT NULL,
        "unitsRemaining"   int NOT NULL,
        "riskNotes"        text,
        "status"           plan_status_enum NOT NULL DEFAULT 'draft',
        "createdBy"        uuid NOT NULL,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "purchase_status_enum" AS ENUM ('active', 'matured', 'settled', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "investment_purchases" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "planId"               uuid NOT NULL REFERENCES "investment_plans"("id") ON DELETE RESTRICT,
        "investorId"           uuid NOT NULL,
        "units"                int NOT NULL,
        "principal"            bigint NOT NULL,
        "status"               purchase_status_enum NOT NULL DEFAULT 'active',
        "purchasedAt"          timestamptz NOT NULL DEFAULT now(),
        "maturesAt"            timestamptz NOT NULL,
        "payoutAmount"         bigint,
        "settlementLedgerRef"  uuid,
        "updatedAt"            timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_purchase_investor" ON "investment_purchases" ("investorId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_purchase_plan"     ON "investment_purchases" ("planId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "investment_settlements" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "planId"              uuid NOT NULL REFERENCES "investment_plans"("id") ON DELETE RESTRICT,
        "actualProfitPerUnit" bigint NOT NULL,
        "settledBy"           uuid NOT NULL,
        "settledAt"           timestamptz NOT NULL DEFAULT now(),
        "notes"               text
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "investment_settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "investment_purchases"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "purchase_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "investment_plans"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plan_status_enum"`);
  }
}
