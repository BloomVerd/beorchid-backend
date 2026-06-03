import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { FarmerSettings } from './farmer-settings.entity';

@ObjectType()
@Entity('farmers')
export class Farmer {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  firstName: string;

  @Field()
  @Column()
  lastName: string;

  @Field()
  @Column({ unique: true })
  email: string;

  @Field()
  @Column()
  country: string;

  @Column({ nullable: true, select: false })
  passwordHash?: string;

  @Column({ nullable: true })
  googleId?: string;

  @Column({ default: true })
  isActive: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('Farm', 'farmer')
  farms: any[];

  @Field(() => FarmerSettings, { nullable: true })
  @OneToOne(() => FarmerSettings, (s) => s.farmer, { nullable: true })
  settings?: FarmerSettings;
}
