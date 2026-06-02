import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatTables1748880000000 implements MigrationInterface {
  name = 'CreateChatTables1748880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chats" (
        "id"        UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "status"    CHARACTER VARYING             NULL,
        "title"     CHARACTER VARYING             NULL,
        "farmerId"  UUID                          NULL,
        "farmId"    UUID                          NULL,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chats" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chats_farmer"
          FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chats_farm"
          FOREIGN KEY ("farmId")   REFERENCES "farms"("id")   ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_messages_role_enum') THEN
          CREATE TYPE "chat_messages_role_enum" AS ENUM ('user', 'assistant');
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id"          UUID                         NOT NULL DEFAULT uuid_generate_v4(),
        "role"        "chat_messages_role_enum"    NOT NULL,
        "content"     TEXT                                  NULL,
        "raw_blocks"  JSONB                                 NULL,
        "is_complete" BOOLEAN                      NOT NULL DEFAULT false,
        "chatId"      UUID                                  NULL,
        "createdAt"   TIMESTAMP                    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_messages_chat"
          FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE
      )
    `);

    // Ensure title column exists (no-op if CREATE TABLE already added it)
    await queryRunner.query(`
      ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "title" CHARACTER VARYING NULL
    `);

    // Populate title from each chat's first user message
    await queryRunner.query(`
      UPDATE "chats" c
      SET "title" = LEFT(cm.content, 60) ||
                    CASE WHEN LENGTH(cm.content) > 60 THEN '...' ELSE '' END
      FROM (
        SELECT DISTINCT ON ("chatId") "chatId", content
        FROM "chat_messages"
        WHERE role = 'user'
          AND is_complete = true
          AND content IS NOT NULL
        ORDER BY "chatId", "createdAt" ASC
      ) cm
      WHERE c.id = cm."chatId"
        AND c.title IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_messages_role_enum"`);
    await queryRunner.query(
      `ALTER TABLE "chats" DROP COLUMN IF EXISTS "title"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "chats"`);
  }
}
