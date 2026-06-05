import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFarmPredictionFields1749400000000 implements MigrationInterface {
  name = 'AddFarmPredictionFields1749400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'farms_growth_stage_enum') THEN
          CREATE TYPE "farms_growth_stage_enum" AS ENUM (
            'germination',
            'vegetative',
            'flowering',
            'fruiting',
            'maturation'
          );
        END IF;
      END $$
    `);

    await queryRunner.query(
      `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "growth_stage" "farms_growth_stage_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "elevation_m" DOUBLE PRECISION`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "days_to_maturity" INTEGER`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farms" DROP COLUMN IF EXISTS "days_to_maturity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms" DROP COLUMN IF EXISTS "elevation_m"`,
    );
    await queryRunner.query(
      `ALTER TABLE "farms" DROP COLUMN IF EXISTS "growth_stage"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "farms_growth_stage_enum"`);
  }
}
