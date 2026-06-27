import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

@InputType()
export class AdminCreateUserInput {
  @Field()
  @IsString()
  firstName: string;

  @Field()
  @IsString()
  lastName: string;

  @Field()
  @IsEmail()
  email: string;

  @Field({ defaultValue: 'GH' })
  @IsString()
  country: string;

  @Field()
  @IsString()
  @MinLength(8)
  password: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  roles?: string[];
}
