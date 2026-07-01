import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ChatSseEvent } from './claude.tools';

/**
 * Redis pub/sub bridge for chat SSE streaming. Maintains two separate ioredis
 * connections — one for publishing (from workers) and one for subscribing (from
 * HTTP handlers) — because a Redis client in subscriber mode cannot issue other
 * commands on the same connection.
 *
 * Each chat session uses a dedicated channel key `chat:{chatId}`. The async
 * generator yielded by `subscribe()` terminates automatically on `done` /
 * `error` events or when the client disconnects (`AbortSignal`).
 */
@Injectable()
export class ChatPubSubService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private subscriber: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL')!;
    // Two separate connections — ioredis subscriber cannot issue other commands while subscribed
    this.publisher = new Redis(url);
    this.subscriber = new Redis(url);
  }

  onModuleDestroy() {
    this.publisher.disconnect();
    this.subscriber.disconnect();
  }

  /** Serialises a `ChatSseEvent` and publishes it to the `chat:{chatId}` Redis channel. */
  async publish(chatId: string, event: ChatSseEvent): Promise<void> {
    await this.publisher.publish(`chat:${chatId}`, JSON.stringify(event));
  }

  /**
   * Subscribes to the `chat:{chatId}` Redis channel and yields raw JSON event
   * strings until a `done` or `error` event is received or `signal` is aborted.
   * Cleans up the Redis subscription on exit regardless of how the generator terminates.
   */
  async *subscribe(
    chatId: string,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const channel = `chat:${chatId}`;
    const queue: string[] = [];
    let resolve: (() => void) | null = null;

    const handler = (_channel: string, message: string) => {
      queue.push(message);
      resolve?.();
      resolve = null;
    };

    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', handler);

    try {
      while (!signal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((res) => {
            resolve = res;
            signal.addEventListener('abort', () => res(), { once: true });
          });
        }
        if (signal.aborted) break;

        const raw = queue.shift()!;
        yield raw;

        const parsed = JSON.parse(raw) as ChatSseEvent;
        if (parsed.type === 'done' || parsed.type === 'error') break;
      }
    } finally {
      this.subscriber.off('message', handler);
      await this.subscriber.unsubscribe(channel);
    }
  }
}
