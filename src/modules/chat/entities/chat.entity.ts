import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Farm } from '../../farm/entities/farm.entity';
import { Farmer } from '../../farmer/entities/farmer.entity';
import { ChatMessage } from './chat-message.entity';

export type ChatStatus = 'processing' | 'done' | 'error';

@Entity('chats')
export class Chat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  status: ChatStatus | null;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @ManyToOne(() => Farmer, { onDelete: 'CASCADE' })
  farmer: Farmer;

  @ManyToOne(() => Farm, { onDelete: 'CASCADE' })
  farm: Farm;

  @OneToMany(() => ChatMessage, (m) => m.chat, { cascade: true })
  messages: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
