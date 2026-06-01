import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsString, MinLength } from 'class-validator';

@InputType()
export class RegisterInput {
  @Field()
  @IsString()
  firstName: string;

  @Field()
  @IsString()
  lastName: string;

  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  country: string;

  @Field()
  @IsString()
  @MinLength(8)
  password: string;
}
