import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedByToOffers1751700000000 implements MigrationInterface {
  name = 'AddCreatedByToOffers1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "createdById" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_offer_created_by" ON "offers" ("createdById")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_offer_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "offers" DROP COLUMN IF EXISTS "createdById"`,
    );
  }
}
