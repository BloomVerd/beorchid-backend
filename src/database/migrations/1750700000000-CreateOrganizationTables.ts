import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationTables1750700000000 implements MigrationInterface {
  name = 'CreateOrganizationTables1750700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "kyc_status_enum" AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"        varchar NOT NULL,
        "kycStatus"   kyc_status_enum NOT NULL DEFAULT 'pending',
        "ownerUserId" uuid NOT NULL,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_members" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "orgId"      uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "userId"     uuid NOT NULL,
        "memberRole" varchar NOT NULL DEFAULT 'member',
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("orgId", "userId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_status_enum"`);
  }
}
