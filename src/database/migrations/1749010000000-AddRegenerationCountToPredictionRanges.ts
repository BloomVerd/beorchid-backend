import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegenerationCountToPredictionRanges1749010000000
  implements MigrationInterface
{
  name = 'AddRegenerationCountToPredictionRanges1749010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "prediction_ranges"
      ADD COLUMN IF NOT EXISTS "regeneration_count" INTEGER NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "prediction_ranges"
      DROP COLUMN IF EXISTS "regeneration_count"
    `);
  }
}
