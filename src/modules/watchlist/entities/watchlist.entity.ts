import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum WatchlistEntityType {
  CROP = 'crop',
  COIN = 'coin',
  LISTING = 'listing',
  PLAN = 'plan',
}

registerEnumType(WatchlistEntityType, { name: 'WatchlistEntityType' });

@ObjectType()
@Entity('watchlists')
export class Watchlist {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  userId: string;

  @Field(() => WatchlistEntityType)
  @Column({ type: 'enum', enum: WatchlistEntityType })
  entityType: WatchlistEntityType;

  @Field()
  @Column()
  entityId: string;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'bigint', nullable: true })
  priceThreshold: number | null;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
