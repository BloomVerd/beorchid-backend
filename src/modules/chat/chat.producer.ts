import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Enqueues chat processing jobs onto the `chat-queue` BullMQ queue.
 * Call `enqueue()` immediately after persisting the user message so the
 * worker can begin the LLM tool loop without blocking the HTTP response.
 */
@Injectable()
export class ChatProducer {
  constructor(@InjectQueue('chat-queue') private readonly chatQueue: Queue) {}

  /** Adds a `process-chat-message` job to the queue for the given chat and farm. */
  async enqueue(chatId: string, farmId: string): Promise<void> {
    await this.chatQueue.add('process-chat-message', { chatId, farmId });
  }
}
