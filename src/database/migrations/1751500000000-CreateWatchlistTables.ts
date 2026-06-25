import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchlistTables1751500000000 implements MigrationInterface {
  name = 'CreateWatchlistTables1751500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "watchlist_entity_type_enum"
        AS ENUM ('crop', 'coin', 'listing', 'plan')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "watchlists" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"         uuid NOT NULL,
        "entityType"     watchlist_entity_type_enum NOT NULL,
        "entityId"       uuid NOT NULL,
        "priceThreshold" bigint,
        "createdAt"      timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("userId", "entityType", "entityId")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_watchlist_user" ON "watchlists" ("userId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "saved_searches" (
        "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId"    uuid NOT NULL,
        "name"      varchar NOT NULL,
        "filters"   jsonb NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_ss_user" ON "saved_searches" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_searches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "watchlists"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "watchlist_entity_type_enum"`);
  }
}
