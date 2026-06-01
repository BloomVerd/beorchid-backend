import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { Farm } from './farm.entity';

@ObjectType()
@Entity('coordinates')
export class Coordinate {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  order: number;

  @Field(() => Float)
  @Column({ type: 'float' })
  lat: number;

  @Field(() => Float)
  @Column({ type: 'float' })
  lon: number;

  @ManyToOne(() => Farm, 'coordinates')
  farm: Farm;
}
