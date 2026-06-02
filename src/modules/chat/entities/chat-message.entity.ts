import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Chat } from './chat.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MessageRole })
  role: MessageRole;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  // Full Anthropic ContentBlock[] for accurate API replay (includes tool_use / tool_result blocks)
  @Column({ type: 'jsonb', nullable: true })
  raw_blocks: any[] | null;

  @Column({ default: false })
  is_complete: boolean;

  @ManyToOne(() => Chat, (c) => c.messages, { onDelete: 'CASCADE' })
  chat: Chat;

  @CreateDateColumn()
  createdAt: Date;
}
