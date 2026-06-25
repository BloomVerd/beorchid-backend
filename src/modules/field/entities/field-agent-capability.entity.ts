import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Entity('field_agent_capabilities')
export class FieldAgentCapability {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  userId: string;

  @Field()
  @Column()
  grantedBy: string;

  @Field()
  @CreateDateColumn()
  grantedAt: Date;

  @Field({ nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
