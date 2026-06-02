import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import Anthropic from '@anthropic-ai/sdk';
import { Chat } from './entities/chat.entity';
import { ChatMessage, MessageRole } from './entities/chat-message.entity';
import { Farm } from '../farm/entities/farm.entity';
import { Farmer } from '../farmer/entities/farmer.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat)
    private readonly chatRepo: Repository<Chat>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    private readonly jwtService: JwtService,
  ) {}

  async initiateMessage(
    farmerId: string,
    farmId: string,
    prompt: string,
    chatId?: string,
  ): Promise<{ chatId: string }> {
    return this.chatRepo.manager.transaction(async (em) => {
      let chat: Chat;

      if (chatId) {
        const found = await em.findOne(Chat, {
          where: { id: chatId, farmer: { id: farmerId } },
        });
        if (!found) throw new NotFoundException('Chat not found');
        chat = found;
      } else {
        chat = em.create(Chat, {
          farm: { id: farmId } as Farm,
          farmer: { id: farmerId } as Farmer,
          status: 'processing',
          title: prompt.slice(0, 60) + (prompt.length > 60 ? '...' : ''),
        });
        await em.save(chat);
      }

      const userMessage = em.create(ChatMessage, {
        chat,
        role: MessageRole.USER,
        content: prompt,
        raw_blocks: [{ type: 'text', text: prompt }],
        is_complete: true,
      });
      await em.save(userMessage);

      chat.status = 'processing';
      await em.save(chat);

      return { chatId: chat.id };
    });
  }

  async buildMessageHistory(chatId: string): Promise<Anthropic.MessageParam[]> {
    const messages = await this.messageRepo.find({
      where: { chat: { id: chatId }, is_complete: true },
      order: { createdAt: 'ASC' },
    });

    return messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: (m.raw_blocks ?? m.content ?? '') as any,
    }));
  }

  async saveAssistantMessage(
    chatId: string,
    blocks: Anthropic.ContentBlock[],
  ): Promise<ChatMessage> {
    const textContent = blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('');

    return this.messageRepo.save(
      this.messageRepo.create({
        chat: { id: chatId } as Chat,
        role: MessageRole.ASSISTANT,
        content: textContent,
        raw_blocks: blocks as any[],
        is_complete: true,
      }),
    );
  }

  async markChatDone(chatId: string): Promise<void> {
    await this.chatRepo.update(chatId, { status: 'done' });
  }

  async markChatError(chatId: string): Promise<void> {
    await this.chatRepo.update(chatId, { status: 'error' });
  }

  async getCompletedMessage(
    chatId: string,
    farmerId: string,
  ): Promise<ChatMessage | null> {
    const chat = await this.chatRepo.findOne({
      where: { id: chatId, farmer: { id: farmerId } },
    });
    if (!chat || chat.status !== 'done') return null;

    return this.messageRepo.findOne({
      where: {
        chat: { id: chatId },
        role: MessageRole.ASSISTANT,
        is_complete: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getMessages(chatId: string, farmerId: string): Promise<ChatMessage[]> {
    const chat = await this.chatRepo.findOne({
      where: { id: chatId, farmer: { id: farmerId } },
    });
    if (!chat) throw new NotFoundException('Chat not found');

    return this.messageRepo.find({
      where: { chat: { id: chatId }, is_complete: true },
      order: { createdAt: 'ASC' },
    });
  }

  async getChats(
    farmerId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Chat[]; total: number; page: number; lastPage: number }> {
    const [data, total] = await this.chatRepo.findAndCount({
      where: { farmer: { id: farmerId } },
      relations: ['farm'],
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, lastPage: Math.ceil(total / limit) || 1 };
  }

  async deleteChat(chatId: string, farmerId: string): Promise<void> {
    await this.chatRepo.manager.transaction(async (em) => {
      const chat = await em.findOne(Chat, {
        where: { id: chatId, farmer: { id: farmerId } },
      });
      if (!chat) throw new NotFoundException('Chat not found');
      await em.remove(chat);
    });
  }

  verifyToken(token: string): { id: string; email: string } {
    return this.jwtService.verify(token);
  }
}
