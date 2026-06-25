import { MigrationInterface, QueryRunner } from 'typeorm';

const newTypes = [
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'OFFER_COUNTERED',
  'DEAL_PAYMENT_REQUIRED',
  'DEAL_COMPLETED',
  'INVESTMENT_PURCHASED',
  'INVESTMENT_MATURED',
  'INVESTMENT_SETTLED',
  'COIN_PRICE_ALERT',
  'COIN_DELISTED',
  'WALLET_DEPOSIT_COMPLETED',
  'WALLET_WITHDRAWAL_COMPLETED',
  'LISTING_MATCH',
  'MARKET_NEW_INSIGHT',
  'FIELD_OBSERVATION_APPROVED',
  'FIELD_OBSERVATION_REJECTED',
  'MARKET_DATA_UPDATED',
  'INGESTION_JOB_COMPLETED',
  'INGESTION_JOB_FAILED',
  'EXTERNAL_FEED_ERROR',
];

export class AddSystem2NotificationTypes1750500000000 implements MigrationInterface {
  name = 'AddSystem2NotificationTypes1750500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of newTypes) {
      await queryRunner.query(
        `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  // PostgreSQL does not support removing enum values; down is a no-op.
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
