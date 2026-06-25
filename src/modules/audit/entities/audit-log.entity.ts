import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Entity('audit_logs')
export class AuditLog {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  actorId: string;

  @Field()
  @Column()
  action: string;

  @Field()
  @Column()
  entity: string;

  @Field()
  @Column()
  entityId: string;

  @Field(() => Object, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  diff: Record<string, unknown> | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
