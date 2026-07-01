/**
 * Chat module — AI-powered farm assistant with real-time SSE streaming.
 *
 * Exposes a REST API for sending prompts and streaming responses. Messages are
 * processed asynchronously via BullMQ (`chat-queue`); token deltas are relayed
 * to connected clients through a Redis pub/sub channel (`ChatPubSubService`).
 * The LLM has access to live farm data via a set of defined tools (`claude.tools.ts`).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Chat } from './entities/chat.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from '../health/entities/farm-health.entity';
import { IotDevice } from '../farm/entities/iot-device.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { FarmModule } from '../farm/farm.module';
import { ChatController } from './chat.controller';
import { ChatResolver } from './chat.resolver';
import { ChatService } from './chat.service';
import { ClaudeService } from './claude.service';
import { ChatPubSubService } from './chat-pubsub.service';
import { ChatProducer } from './chat.producer';
import { ChatConsumer } from './chat.consumer';
import { JwtStrategy } from 'src/common/strategies';

@Module({
  imports: [
    ConfigModule,
    FarmModule,
    BullModule.registerQueue({ name: 'chat-queue' }),
    TypeOrmModule.forFeature([
      Chat,
      ChatMessage,
      Farm,
      FarmHealth,
      IotDevice,
      Prediction,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        secret: cs.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [
    ChatResolver,
    ChatService,
    ClaudeService,
    ChatPubSubService,
    ChatProducer,
    ChatConsumer,
    JwtStrategy,
  ],
})
export class ChatModule {}
