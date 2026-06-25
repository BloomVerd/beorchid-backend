import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRolesToFarmer1750400000000 implements MigrationInterface {
  name = 'AddRolesToFarmer1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farmers" ADD COLUMN IF NOT EXISTS "roles" text NOT NULL DEFAULT 'farmer'`,
    );
    await queryRunner.query(
      `ALTER TABLE "farmers" ADD COLUMN IF NOT EXISTS "isFieldAgent" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "farmers" DROP COLUMN IF EXISTS "isFieldAgent"`);
    await queryRunner.query(`ALTER TABLE "farmers" DROP COLUMN IF EXISTS "roles"`);
  }
}
