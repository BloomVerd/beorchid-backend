import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Organization } from './organization.entity';

@ObjectType()
@Entity('organization_members')
export class OrganizationMember {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  userId: string;

  @Field()
  @Column({ default: 'member' })
  memberRole: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, (o) => o.members, { onDelete: 'CASCADE' })
  @JoinColumn()
  organization: Organization;

  @Field()
  @Column()
  orgId: string;
}
