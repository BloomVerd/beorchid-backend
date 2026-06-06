import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionTables1749500000000
  implements MigrationInterface
{
  name = 'CreateSubscriptionTables1749500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscription_plans" (
        "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"                        VARCHAR NOT NULL UNIQUE,
        "displayName"                 VARCHAR NOT NULL,
        "priceAmount"                 INTEGER NOT NULL DEFAULT 0,
        "currency"                    VARCHAR NOT NULL DEFAULT 'GHS',
        "predictionWeeklyLimit"       INTEGER NOT NULL DEFAULT 3,
        "farmDataLookbackSeconds"     INTEGER NOT NULL DEFAULT 3600,
        "farmDataCacheTtlSeconds"     INTEGER NOT NULL DEFAULT 3600,
        "healthReportIntervalSeconds" INTEGER NOT NULL DEFAULT 3600,
        "maxFarms"                    INTEGER NOT NULL DEFAULT 2,
        "features"                    TEXT NOT NULL DEFAULT '[]',
        "isActive"                    BOOLEAN NOT NULL DEFAULT true,
        "createdAt"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"                   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "farmer_subscriptions" (
        "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "farmerId"                    UUID NOT NULL REFERENCES "farmers"("id") ON DELETE CASCADE,
        "planId"                      UUID NOT NULL REFERENCES "subscription_plans"("id"),
        "status"                      VARCHAR NOT NULL DEFAULT 'active',
        "currentPeriodStart"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "currentPeriodEnd"            TIMESTAMPTZ,
        "paystackCustomerCode"        VARCHAR,
        "paystackSubscriptionCode"    VARCHAR,
        "createdAt"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"                   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_farmer_subscriptions_farmer_status"
      ON "farmer_subscriptions" ("farmerId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_transactions" (
        "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "farmerId"            UUID NOT NULL REFERENCES "farmers"("id") ON DELETE CASCADE,
        "subscriptionId"      UUID REFERENCES "farmer_subscriptions"("id") ON DELETE SET NULL,
        "planId"              UUID NOT NULL,
        "paystackReference"   VARCHAR NOT NULL UNIQUE,
        "paystackAccessCode"  VARCHAR,
        "amount"              INTEGER NOT NULL,
        "currency"            VARCHAR NOT NULL DEFAULT 'GHS',
        "status"              VARCHAR NOT NULL DEFAULT 'pending',
        "metadata"            TEXT,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "farmer_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_plans"`);
  }
}
