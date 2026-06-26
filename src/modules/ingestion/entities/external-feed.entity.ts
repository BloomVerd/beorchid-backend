import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum FeedFormat {
  JSON = 'json',
  CSV = 'csv',
}

registerEnumType(FeedFormat, { name: 'FeedFormat' });

@ObjectType()
@Entity('external_feeds')
export class ExternalFeed {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  name: string;

  @Field()
  @Column({ type: 'text' })
  url: string;

  @Field(() => FeedFormat)
  @Column({ type: 'enum', enum: FeedFormat })
  format: FeedFormat;

  @Field(() => Object)
  @Column({ type: 'jsonb' })
  fieldMap: Record<string, string>;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  cropId: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Field()
  @Column()
  priceType: string;

  @Field()
  @Column()
  sourceLabel: string;

  @Field()
  @Column()
  scheduleCron: string;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  lastRunStatus: string | null;

  @Field()
  @Column()
  createdBy: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
