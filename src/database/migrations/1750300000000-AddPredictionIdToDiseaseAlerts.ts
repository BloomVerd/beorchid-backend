import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPredictionIdToDiseaseAlerts1750300000000 implements MigrationInterface {
  name = 'AddPredictionIdToDiseaseAlerts1750300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "disease_alerts"
        ADD COLUMN IF NOT EXISTS "predictionId" UUID NULL,
        ADD CONSTRAINT "FK_disease_alerts_prediction"
          FOREIGN KEY ("predictionId")
          REFERENCES "predictions"("id")
          ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "disease_alerts"
        DROP CONSTRAINT IF EXISTS "FK_disease_alerts_prediction",
        DROP COLUMN IF EXISTS "predictionId"
    `);
  }
}
