import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Farmer } from '../../farmer/entities/farmer.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  farmerId: string;

  @Column({ unique: true })
  token: string;

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Farmer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'farmerId' })
  farmer: Farmer;
}
