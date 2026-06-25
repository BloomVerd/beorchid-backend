import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketplaceTables1751200000000 implements MigrationInterface {
  name = 'CreateMarketplaceTables1751200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "listing_status_enum"
        AS ENUM ('draft', 'open', 'under_offer', 'accepted', 'sold', 'withdrawn', 'expired')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "listings" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "farmId"       uuid NOT NULL,
        "sellerId"     uuid NOT NULL,
        "crop"         varchar NOT NULL,
        "acreage"      numeric NOT NULL,
        "region"       varchar NOT NULL,
        "askingPrice"  bigint NOT NULL,
        "currency"     varchar NOT NULL DEFAULT 'GHS',
        "description"  text,
        "status"       listing_status_enum NOT NULL DEFAULT 'draft',
        "expiresAt"    timestamptz,
        "createdAt"    timestamptz NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_listing_seller" ON "listings" ("sellerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_listing_status" ON "listings" ("status")`);

    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "offer_status_enum"
        AS ENUM ('pending', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "offers" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "listingId"     uuid NOT NULL REFERENCES "listings"("id") ON DELETE CASCADE,
        "buyerId"       uuid NOT NULL,
        "amount"        bigint NOT NULL,
        "currency"      varchar NOT NULL DEFAULT 'GHS',
        "message"       text,
        "status"        offer_status_enum NOT NULL DEFAULT 'pending',
        "parentOfferId" uuid,
        "expiresAt"     timestamptz,
        "createdAt"     timestamptz NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_offer_listing" ON "offers" ("listingId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_offer_buyer"   ON "offers" ("buyerId")`);

    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "deal_status_enum"
        AS ENUM ('pending_payment', 'in_escrow', 'completed', 'cancelled', 'disputed')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deals" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "listingId"        uuid NOT NULL REFERENCES "listings"("id") ON DELETE RESTRICT,
        "acceptedOfferId"  uuid NOT NULL,
        "sellerId"         uuid NOT NULL,
        "buyerId"          uuid NOT NULL,
        "amount"           bigint NOT NULL,
        "status"           deal_status_enum NOT NULL DEFAULT 'pending_payment',
        "escrowLedgerRef"  uuid,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deals"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deal_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "offers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "offer_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "listings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "listing_status_enum"`);
  }
}
