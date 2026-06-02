import { Test, TestingModule } from '@nestjs/testing';
import { ChatConsumer } from './chat.consumer';
import { ChatService } from './chat.service';
import { ClaudeService } from './claude.service';
import { ChatPubSubService } from './chat-pubsub.service';
import { MessageRole } from './entities/chat-message.entity';

const makeJob = (data: object, name = 'process-chat-message') => ({
  name,
  data,
});

const makeSavedMessage = (overrides = {}) => ({
  id: 'msg-assistant-1',
  role: MessageRole.ASSISTANT,
  content: 'Your farm is healthy.',
  is_complete: true,
  ...overrides,
});

describe('ChatConsumer', () => {
  let consumer: ChatConsumer;
  let chatService: {
    buildMessageHistory: jest.Mock;
    saveAssistantMessage: jest.Mock;
    markChatDone: jest.Mock;
    markChatError: jest.Mock;
  };
  let claudeService: { streamAndProcess: jest.Mock };
  let pubSub: { publish: jest.Mock };

  beforeEach(async () => {
    chatService = {
      buildMessageHistory: jest.fn().mockResolvedValue([]),
      saveAssistantMessage: jest.fn().mockResolvedValue(makeSavedMessage()),
      markChatDone: jest.fn().mockResolvedValue(undefined),
      markChatError: jest.fn().mockResolvedValue(undefined),
    };

    claudeService = {
      streamAndProcess: jest.fn().mockResolvedValue([{ type: 'text', text: 'Your farm is healthy.' }]),
    };

    pubSub = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatConsumer,
        { provide: ChatService, useValue: chatService },
        { provide: ClaudeService, useValue: claudeService },
        { provide: ChatPubSubService, useValue: pubSub },
      ],
    }).compile();

    consumer = module.get<ChatConsumer>(ChatConsumer);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('ignores jobs with an unrecognised name', async () => {
      await consumer.process(makeJob({ chatId: 'c1', farmId: 'f1' }, 'other-job') as any);

      expect(chatService.buildMessageHistory).not.toHaveBeenCalled();
      expect(claudeService.streamAndProcess).not.toHaveBeenCalled();
    });

    it('runs the full happy path and publishes done event', async () => {
      const job = makeJob({ chatId: 'chat-id-1', farmId: 'farm-id-1' });
      const history = [{ role: 'user', content: 'Hello' }];
      const blocks = [{ type: 'text', text: 'Your farm is healthy.' }];
      chatService.buildMessageHistory.mockResolvedValue(history);
      claudeService.streamAndProcess.mockResolvedValue(blocks);
      chatService.saveAssistantMessage.mockResolvedValue(makeSavedMessage());

      await consumer.process(job as any);

      expect(chatService.buildMessageHistory).toHaveBeenCalledWith('chat-id-1');
      expect(claudeService.streamAndProcess).toHaveBeenCalledWith('chat-id-1', 'farm-id-1', history);
      expect(chatService.saveAssistantMessage).toHaveBeenCalledWith('chat-id-1', blocks);
      expect(chatService.markChatDone).toHaveBeenCalledWith('chat-id-1');
      expect(pubSub.publish).toHaveBeenCalledWith('chat-id-1', {
        type: 'done',
        chatId: 'chat-id-1',
        messageId: 'msg-assistant-1',
      });
    });

    it('publishes error event and marks chat as error when ClaudeService throws', async () => {
      claudeService.streamAndProcess.mockRejectedValue(new Error('Anthropic API timeout'));
      const job = makeJob({ chatId: 'chat-id-1', farmId: 'farm-id-1' });

      await consumer.process(job as any);

      expect(chatService.markChatError).toHaveBeenCalledWith('chat-id-1');
      expect(pubSub.publish).toHaveBeenCalledWith('chat-id-1', {
        type: 'error',
        chatId: 'chat-id-1',
        message: 'Anthropic API timeout',
      });
      expect(chatService.markChatDone).not.toHaveBeenCalled();
    });

    it('publishes error event when buildMessageHistory throws', async () => {
      chatService.buildMessageHistory.mockRejectedValue(new Error('DB connection lost'));
      const job = makeJob({ chatId: 'chat-id-2', farmId: 'farm-id-1' });

      await consumer.process(job as any);

      expect(chatService.markChatError).toHaveBeenCalledWith('chat-id-2');
      expect(pubSub.publish).toHaveBeenCalledWith('chat-id-2', {
        type: 'error',
        chatId: 'chat-id-2',
        message: 'DB connection lost',
      });
    });

    it('publishes error event when saveAssistantMessage throws', async () => {
      chatService.saveAssistantMessage.mockRejectedValue(new Error('Disk full'));
      const job = makeJob({ chatId: 'chat-id-3', farmId: 'farm-id-1' });

      await consumer.process(job as any);

      expect(chatService.markChatError).toHaveBeenCalledWith('chat-id-3');
      expect(pubSub.publish).toHaveBeenCalledWith('chat-id-3', {
        type: 'error',
        chatId: 'chat-id-3',
        message: 'Disk full',
      });
      expect(chatService.markChatDone).not.toHaveBeenCalled();
    });

    it('does not call saveAssistantMessage or markChatDone when streaming fails', async () => {
      claudeService.streamAndProcess.mockRejectedValue(new Error('stream error'));
      const job = makeJob({ chatId: 'chat-id-1', farmId: 'farm-id-1' });

      await consumer.process(job as any);

      expect(chatService.saveAssistantMessage).not.toHaveBeenCalled();
      expect(chatService.markChatDone).not.toHaveBeenCalled();
    });
  });
});
