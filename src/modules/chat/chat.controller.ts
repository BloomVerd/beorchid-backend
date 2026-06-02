import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatProducer } from './chat.producer';
import { ChatPubSubService } from './chat-pubsub.service';
import { SendMessageDto, SendMessageResponseDto } from './dto/send-message.dto';

@Controller('v1/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatProducer: ChatProducer,
    private readonly pubSub: ChatPubSubService,
  ) {}

  @Post('message')
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Req() req: any,
  ): Promise<SendMessageResponseDto> {
    const farmer = req.user as { id: string; email: string };
    const { chatId } = await this.chatService.initiateMessage(
      farmer.id,
      dto.farmId,
      dto.prompt,
      dto.chatId,
    );
    await this.chatProducer.enqueue(chatId, dto.farmId);
    return { chatId };
  }

  @Get(':chatId/stream')
  async streamChat(
    @Param('chatId') chatId: string,
    @Query('token') token: string,
    @Req() req: any,
    @Res() res: any,
  ): Promise<void> {
    let farmer: { id: string; email: string };
    try {
      farmer = this.chatService.verifyToken(token);
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    // Race condition: Claude already finished before the client connected
    const completed = await this.chatService.getCompletedMessage(
      chatId,
      farmer.id,
    );
    if (completed) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(
        `data: ${JSON.stringify({ type: 'token', chatId, delta: completed.content ?? '' })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ type: 'done', chatId, messageId: completed.id })}\n\n`,
      );
      res.end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      for await (const rawEvent of this.pubSub.subscribe(
        chatId,
        abortController.signal,
      )) {
        if (abortController.signal.aborted) break;
        res.write(`data: ${rawEvent}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  @Get(':chatId/messages')
  @UseGuards(JwtAuthGuard)
  async getMessages(@Param('chatId') chatId: string, @Req() req: any) {
    const farmer = req.user as { id: string; email: string };
    return this.chatService.getMessages(chatId, farmer.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getChats(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const farmer = req.user as { id: string; email: string };
    return this.chatService.getChats(farmer.id, page, limit);
  }

  @Delete(':chatId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteChat(
    @Param('chatId') chatId: string,
    @Req() req: any,
  ): Promise<void> {
    const farmer = req.user as { id: string; email: string };
    await this.chatService.deleteChat(chatId, farmer.id);
  }
}
