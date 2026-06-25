import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsUUID } from 'class-validator';

@InputType()
export class AddOrgMemberInput {
  @Field()
  @IsUUID()
  orgId: string;

  @Field()
  @IsUUID()
  userId: string;

  @Field({ defaultValue: 'member' })
  @IsString()
  memberRole: string;
}
