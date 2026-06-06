import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDurationDaysToSubscriptionPlan1749600000000
  implements MigrationInterface
{
  name = 'AddDurationDaysToSubscriptionPlan1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
        ADD COLUMN IF NOT EXISTS "durationDays" INTEGER NOT NULL DEFAULT 0
    `);

    // Fix any already-seeded rows: set correct durationDays and priceAmount (pesewas)
    await queryRunner.query(`
      UPDATE "subscription_plans"
      SET "durationDays" = 365, "priceAmount" = 200000
      WHERE "name" = 'popular'
    `);
    await queryRunner.query(`
      UPDATE "subscription_plans"
      SET "durationDays" = 365, "priceAmount" = 500000
      WHERE "name" = 'premium'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "durationDays"
    `);
  }
}
