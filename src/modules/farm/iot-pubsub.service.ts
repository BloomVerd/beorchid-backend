import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface IotSseEvent {
  type: 'tool_call_update';
  farmId: string;
  toolCallId: string;
  status: string;
  response?: Record<string, unknown>;
}

@Injectable()
export class IotPubSubService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private subscriber: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL')!;
    this.publisher = new Redis(url);
    this.subscriber = new Redis(url);
  }

  onModuleDestroy() {
    this.publisher.disconnect();
    this.subscriber.disconnect();
  }

  async publish(farmId: string, event: IotSseEvent): Promise<void> {
    await this.publisher.publish(`iot:${farmId}`, JSON.stringify(event));
  }

  async *subscribe(
    farmId: string,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const channel = `iot:${farmId}`;
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
        yield queue.shift()!;
      }
    } finally {
      this.subscriber.off('message', handler);
      await this.subscriber.unsubscribe(channel);
    }
  }
}
