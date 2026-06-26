import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryAndRegionToCrops1751600000000
  implements MigrationInterface
{
  name = 'AddCategoryAndRegionToCrops1751600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crops" ADD COLUMN IF NOT EXISTS "category" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "crops" ADD COLUMN IF NOT EXISTS "region" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crops" DROP COLUMN IF EXISTS "region"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crops" DROP COLUMN IF EXISTS "category"`,
    );
  }
}
