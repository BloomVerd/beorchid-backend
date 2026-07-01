import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ChatService } from './chat.service';
import { ClaudeService } from './claude.service';
import { ChatPubSubService } from './chat-pubsub.service';

/**
 * BullMQ worker for the `chat-queue`. Processes `process-chat-message` jobs
 * by invoking the LLM tool loop, saving the assistant reply, and publishing
 * the final `done` or `error` event to the Redis SSE channel.
 */
@Processor('chat-queue')
export class ChatConsumer extends WorkerHost {
  constructor(
    private readonly chatService: ChatService,
    private readonly claudeService: ClaudeService,
    private readonly pubSub: ChatPubSubService,
  ) {
    super();
  }

  /**
   * Entry point for BullMQ. Delegates to `ClaudeService.streamAndProcess()`,
   * saves the assistant message, marks the chat done, and publishes the `done`
   * SSE event. On any error marks the chat `error` and publishes an `error` event.
   */
  async process(job: Job): Promise<void> {
    if (job.name !== 'process-chat-message') return;

    const { chatId, farmId } = job.data as { chatId: string; farmId: string };

    try {
      const messages = await this.chatService.buildMessageHistory(chatId);
      const assistantText = await this.claudeService.streamAndProcess(
        chatId,
        farmId,
        messages,
      );

      const savedMsg = await this.chatService.saveAssistantMessage(
        chatId,
        assistantText,
      );
      await this.chatService.markChatDone(chatId);

      await this.pubSub.publish(chatId, {
        type: 'done',
        chatId,
        messageId: savedMsg.id,
      });
    } catch (err) {
      await this.chatService.markChatError(chatId);
      await this.pubSub.publish(chatId, {
        type: 'error',
        chatId,
        message: (err as Error).message ?? 'Processing failed',
      });
    }
  }
}
