import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoinTables1751400000000 implements MigrationInterface {
  name = 'CreateCoinTables1751400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "coin_status_enum" AS ENUM ('draft', 'active', 'paused', 'delisted');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coins" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"              varchar NOT NULL,
        "symbol"            varchar NOT NULL UNIQUE,
        "cropId"            uuid,
        "basePrice"         bigint NOT NULL,
        "currentPrice"      bigint NOT NULL,
        "circulatingSupply" numeric NOT NULL DEFAULT 0,
        "pricingWeights"    jsonb NOT NULL DEFAULT '{"w_trend":0.3,"w_demand":0.2,"w_health":0.3,"w_vol":0.2}',
        "status"            coin_status_enum NOT NULL DEFAULT 'draft',
        "createdBy"         uuid NOT NULL,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coin_price_points" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "coinId"     uuid NOT NULL REFERENCES "coins"("id") ON DELETE CASCADE,
        "price"      bigint NOT NULL,
        "computedAt" timestamptz NOT NULL DEFAULT now(),
        "inputs"     jsonb NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_cpp_coin_date" ON "coin_price_points" ("coinId", "computedAt" DESC)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coin_holdings" (
        "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"    uuid NOT NULL,
        "coinId"    uuid NOT NULL REFERENCES "coins"("id") ON DELETE RESTRICT,
        "units"     numeric NOT NULL DEFAULT 0,
        "avgCost"   bigint NOT NULL DEFAULT 0,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("userId", "coinId")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "coin_side_enum" AS ENUM ('buy', 'sell');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coin_transactions" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"      uuid NOT NULL,
        "coinId"      uuid NOT NULL REFERENCES "coins"("id") ON DELETE RESTRICT,
        "side"        coin_side_enum NOT NULL,
        "units"       numeric NOT NULL,
        "unitPrice"   bigint NOT NULL,
        "grossAmount" bigint NOT NULL,
        "fee"         bigint NOT NULL DEFAULT 0,
        "executedAt"  timestamptz NOT NULL DEFAULT now(),
        "ledgerRef"   uuid
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ctxn_user" ON "coin_transactions" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "coin_transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "coin_side_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coin_holdings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coin_price_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coins"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "coin_status_enum"`);
  }
}
