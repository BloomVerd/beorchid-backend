import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Farm } from '../../farm/entities/farm.entity';
import { Farmer } from '../../farmer/entities/farmer.entity';
import { ChatMessage } from './chat-message.entity';

export type ChatStatus = 'processing' | 'done' | 'error';

@ObjectType()
@Entity('chats')
export class Chat {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  status: ChatStatus | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @ManyToOne(() => Farmer, { onDelete: 'CASCADE' })
  farmer: Farmer;

  @Field(() => Farm, { nullable: true })
  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  farm: Farm;

  @OneToMany(() => ChatMessage, (m) => m.chat, { cascade: true })
  messages: ChatMessage[];

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
