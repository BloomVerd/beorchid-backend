import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionToPredictions1749900000000 implements MigrationInterface {
  name = 'AddDescriptionToPredictions1749900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "predictions"
        ADD COLUMN IF NOT EXISTS "description" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "predictions"
        DROP COLUMN IF EXISTS "description"
    `);
  }
}
