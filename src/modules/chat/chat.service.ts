import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import OpenAI from 'openai';
import { Chat } from './entities/chat.entity';
import { ChatMessage, MessageRole } from './entities/chat-message.entity';
import { Farm } from '../farm/entities/farm.entity';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * Core data-access service for the chat module. Handles chat and message
 * persistence, message history assembly for LLM replay, and JWT verification
 * used by the SSE stream endpoint (which cannot use standard HTTP auth headers).
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat)
    private readonly chatRepo: Repository<Chat>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    private readonly jwtService: JwtService,
  ) {}

  // ── Chat lifecycle ───────────────────────────────────────────────────────────

  /**
   * Creates or resumes a chat thread and saves the user's prompt as the first
   * message. Runs inside a transaction to guarantee the chat record and user
   * message are written atomically. Returns `{ chatId }` for the producer to enqueue.
   *
   * @throws NotFoundException if `chatId` is provided but does not belong to the farmer
   */
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

  // ── LLM history ─────────────────────────────────────────────────────────────

  /**
   * Assembles the full conversation history for a chat as an OpenAI-compatible
   * message array, ordered oldest-first. Only `is_complete` messages are
   * included so in-flight partial writes are excluded from the LLM context.
   */
  async buildMessageHistory(
    chatId: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const messages = await this.messageRepo.find({
      where: { chat: { id: chatId }, is_complete: true },
      order: { createdAt: 'ASC' },
    });

    return messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '',
    }));
  }

  /** Persists the final assembled assistant response as a completed `ChatMessage`. */
  async saveAssistantMessage(
    chatId: string,
    content: string,
  ): Promise<ChatMessage> {
    return this.messageRepo.save(
      this.messageRepo.create({
        chat: { id: chatId } as Chat,
        role: MessageRole.ASSISTANT,
        content,
        raw_blocks: [{ type: 'text', text: content }] as any[],
        is_complete: true,
      }),
    );
  }

  // ── Status helpers ───────────────────────────────────────────────────────────

  /** Sets the chat status to `"done"` after the LLM response is fully saved. */
  async markChatDone(chatId: string): Promise<void> {
    await this.chatRepo.update(chatId, { status: 'done' });
  }

  /** Sets the chat status to `"error"` when the LLM worker throws. */
  async markChatError(chatId: string): Promise<void> {
    await this.chatRepo.update(chatId, { status: 'error' });
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  /**
   * Returns the latest completed assistant message for a chat if it has
   * already finished processing, or `null` if still in progress. Used by the
   * SSE controller to handle the race where the LLM finishes before the client
   * connects to the stream.
   */
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

  /**
   * Returns all completed messages for a chat, scoped to the owning farmer.
   *
   * @throws NotFoundException if the chat does not belong to the farmer
   */
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

  /** Returns a paginated list of chat threads for the given farmer, ordered by last update. */
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

  /**
   * Deletes a chat and all its messages (cascade). Scoped to the owning farmer.
   *
   * @throws NotFoundException if the chat does not belong to the farmer
   */
  async deleteChat(chatId: string, farmerId: string): Promise<void> {
    await this.chatRepo.manager.transaction(async (em) => {
      const chat = await em.findOne(Chat, {
        where: { id: chatId, farmer: { id: farmerId } },
      });
      if (!chat) throw new NotFoundException('Chat not found');
      await em.remove(chat);
    });
  }

  /**
   * Verifies a JWT and returns its payload. Used by the SSE stream endpoint,
   * which receives the token as a query parameter instead of an `Authorization` header.
   *
   * @throws JsonWebTokenError / TokenExpiredError on invalid or expired tokens
   */
  verifyToken(token: string): { id: string; email: string } {
    return this.jwtService.verify(token);
  }
}
