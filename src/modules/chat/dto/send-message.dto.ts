import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsUUID()
  farmId: string;

  @IsUUID()
  @IsOptional()
  chatId?: string;
}

export class SendMessageResponseDto {
  chatId: string;
}
