import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1750100000000 implements MigrationInterface {
  name = 'CreateNotificationsTable1750100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE IF NOT EXISTS "notification_type_enum" AS ENUM ('PREDICTION_ALERT')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id"         uuid               NOT NULL DEFAULT uuid_generate_v4(),
        "title"      varchar            NOT NULL,
        "message"    text               NOT NULL,
        "type"       "notification_type_enum" NOT NULL,
        "isRead"     boolean            NOT NULL DEFAULT false,
        "createdAt"  TIMESTAMP          NOT NULL DEFAULT now(),
        "farmerId"   uuid,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_farmer"
          FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_farmer" ON "notifications" ("farmerId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_farmer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`);
  }
}
