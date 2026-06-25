import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletTables1751100000000 implements MigrationInterface {
  name = 'CreateWalletTables1751100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "wallet_owner_type_enum" AS ENUM ('user', 'org')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerType"        wallet_owner_type_enum NOT NULL,
        "ownerId"          uuid NOT NULL,
        "currency"         varchar NOT NULL DEFAULT 'GHS',
        "availableBalance" bigint NOT NULL DEFAULT 0,
        "lockedBalance"    bigint NOT NULL DEFAULT 0,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("ownerType", "ownerId", "currency")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "ledger_direction_enum" AS ENUM ('debit', 'credit')
    `);
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "ledger_account_enum"
        AS ENUM ('user_cash', 'escrow', 'platform_fee', 'coin_pool', 'investment_pool', 'external')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_entries" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "transactionId" uuid NOT NULL,
        "walletId"      uuid NOT NULL REFERENCES "wallets"("id") ON DELETE RESTRICT,
        "direction"     ledger_direction_enum NOT NULL,
        "amount"        bigint NOT NULL,
        "account"       ledger_account_enum NOT NULL,
        "createdAt"     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ledger_wallet" ON "ledger_entries" ("walletId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ledger_txn"    ON "ledger_entries" ("transactionId")`);

    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "payment_intent_v2_type_enum"   AS ENUM ('deposit', 'withdrawal')
    `);
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "payment_intent_v2_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_intents_v2" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "walletId"        uuid NOT NULL REFERENCES "wallets"("id") ON DELETE RESTRICT,
        "provider"        varchar NOT NULL DEFAULT 'paystack',
        "providerRef"     varchar,
        "type"            payment_intent_v2_type_enum NOT NULL,
        "amount"          bigint NOT NULL,
        "status"          payment_intent_v2_status_enum NOT NULL DEFAULT 'pending',
        "idempotencyKey"  varchar NOT NULL UNIQUE,
        "checkoutUrl"     varchar,
        "createdAt"       timestamptz NOT NULL DEFAULT now(),
        "updatedAt"       timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_intents_v2"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_intent_v2_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_intent_v2_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ledger_account_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ledger_direction_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallets"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wallet_owner_type_enum"`);
  }
}
