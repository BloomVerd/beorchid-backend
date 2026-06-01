import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('magic_link_tokens')
export class MagicLinkToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ unique: true })
  token: string;

  @Column()
  expiresAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  usedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
