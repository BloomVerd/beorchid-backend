import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Entity('saved_searches')
export class SavedSearch {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  userId: string;

  @Field()
  @Column()
  name: string;

  @Field(() => Object)
  @Column({ type: 'jsonb' })
  filters: Record<string, unknown>;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
