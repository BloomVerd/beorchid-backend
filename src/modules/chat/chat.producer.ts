import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ChatProducer {
  constructor(@InjectQueue('chat-queue') private readonly chatQueue: Queue) {}

  async enqueue(chatId: string, farmId: string): Promise<void> {
    await this.chatQueue.add('process-chat-message', { chatId, farmId });
  }
}
