import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationTypeValues1750200000000
  implements MigrationInterface
{
  name = 'AddNotificationTypeValues1750200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'HEALTH_ALERT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_ACTIVATED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'FARM_SETUP_COMPLETE'`,
    );
  }

  // PostgreSQL does not support removing enum values; down is intentionally a no-op.
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
