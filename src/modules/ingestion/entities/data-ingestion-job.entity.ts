import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum IngestionJobType {
  CSV_UPLOAD = 'csv_upload',
  JSON_UPLOAD = 'json_upload',
  EXTERNAL_FEED_RUN = 'external_feed_run',
  FORECAST_IMPORT = 'forecast_import',
}

export enum IngestionJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

registerEnumType(IngestionJobType, { name: 'IngestionJobType' });
registerEnumType(IngestionJobStatus, { name: 'IngestionJobStatus' });

@ObjectType()
@Entity('data_ingestion_jobs')
export class DataIngestionJob {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => IngestionJobType)
  @Column({ type: 'enum', enum: IngestionJobType })
  type: IngestionJobType;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  feedId: string | null;

  @Field()
  @Column()
  submittedBy: string;

  @Field(() => IngestionJobStatus)
  @Column({ type: 'enum', enum: IngestionJobStatus, default: IngestionJobStatus.PENDING })
  status: IngestionJobStatus;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  rowCount: number | null;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  processedCount: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  skippedCount: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  errorCount: number;

  @Field(() => Object, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  errors: Array<{ row: number; field: string; message: string }> | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  storageRef: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
