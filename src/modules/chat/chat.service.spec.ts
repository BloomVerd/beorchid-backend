import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Chat } from './entities/chat.entity';
import { ChatMessage, MessageRole } from './entities/chat-message.entity';

const makeChat = (overrides: Partial<Chat> = {}): Chat =>
  ({
    id: 'chat-id-1',
    status: 'processing',
    farmer: { id: 'farmer-id-1' } as any,
    farm: { id: 'farm-id-1' } as any,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Chat;

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: 'msg-id-1',
    role: MessageRole.USER,
    content: 'Hello',
    raw_blocks: [{ type: 'text', text: 'Hello' }],
    is_complete: true,
    chat: { id: 'chat-id-1' } as any,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  }) as ChatMessage;

describe('ChatService', () => {
  let service: ChatService;
  let chatRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let messageRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let jwtService: { verify: jest.Mock };
  let mockEm: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    mockEm = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((_, data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };

    chatRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockEm)),
      },
    };

    messageRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (entity) => entity),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
    };

    jwtService = { verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(Chat), useValue: chatRepo },
        { provide: getRepositoryToken(ChatMessage), useValue: messageRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('initiateMessage', () => {
    it('creates a new chat when no chatId is given', async () => {
      // TypeORM save() mutates the entity in-place with the generated PK
      mockEm.save.mockImplementation(async (entity) => {
        if (!entity.id) entity.id = 'chat-id-new';
        return entity;
      });

      const result = await service.initiateMessage(
        'farmer-id-1',
        'farm-id-1',
        'How is my farm?',
      );

      expect(result.chatId).toBe('chat-id-new');
      // create called for Chat then ChatMessage
      expect(mockEm.create).toHaveBeenCalledTimes(2);
    });

    it('reuses existing chat when a valid chatId is given', async () => {
      const existingChat = makeChat();
      mockEm.findOne.mockResolvedValue(existingChat);

      const result = await service.initiateMessage(
        'farmer-id-1',
        'farm-id-1',
        'Follow-up question',
        'chat-id-1',
      );

      expect(result.chatId).toBe('chat-id-1');
      // No new Chat created — only ChatMessage
      const createCalls = mockEm.create.mock.calls.map((c) => c[0]);
      expect(createCalls).not.toContain(Chat);
    });

    it('throws NotFoundException when chatId belongs to a different farmer', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.initiateMessage('farmer-id-1', 'farm-id-1', 'Hello', 'wrong-chat-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('saves the user message with is_complete: true', async () => {
      const prompt = 'What are the soil conditions?';
      mockEm.save.mockImplementation(async (entity) => ({
        ...entity,
        id: entity.id ?? 'generated-id',
      }));

      await service.initiateMessage('farmer-id-1', 'farm-id-1', prompt);

      const savedUserMsg = mockEm.save.mock.calls.find(
        ([entity]) => entity.role === MessageRole.USER,
      )?.[0];
      expect(savedUserMsg).toBeDefined();
      expect(savedUserMsg.content).toBe(prompt);
      expect(savedUserMsg.is_complete).toBe(true);
    });

    it('sets chat status to processing', async () => {
      const existingChat = makeChat({ status: 'done' });
      mockEm.findOne.mockResolvedValue(existingChat);

      await service.initiateMessage('farmer-id-1', 'farm-id-1', 'New question', 'chat-id-1');

      const chatSaveCall = mockEm.save.mock.calls.find(
        ([entity]) => entity.status !== undefined && entity.role === undefined,
      );
      expect(chatSaveCall?.[0].status).toBe('processing');
    });
  });

  describe('buildMessageHistory', () => {
    it('returns messages ordered by createdAt ASC mapped to Anthropic format', async () => {
      const messages = [
        makeMessage({ role: MessageRole.USER, content: 'Hello', createdAt: new Date('2024-01-01T10:00:00Z') }),
        makeMessage({ id: 'msg-2', role: MessageRole.ASSISTANT, content: 'Hi there', raw_blocks: [{ type: 'text', text: 'Hi there' }], createdAt: new Date('2024-01-01T10:01:00Z') }),
      ];
      messageRepo.find.mockResolvedValue(messages);

      const result = await service.buildMessageHistory('chat-id-1');

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
      expect(messageRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_complete: true }),
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('uses raw_blocks when available for Anthropic API replay', async () => {
      const blocks = [
        { type: 'text', text: 'answer' },
        { type: 'tool_use', id: 'tu_1', name: 'get_farm_health', input: {} },
      ];
      const msg = makeMessage({
        role: MessageRole.ASSISTANT,
        content: 'answer',
        raw_blocks: blocks,
      });
      messageRepo.find.mockResolvedValue([msg]);

      const result = await service.buildMessageHistory('chat-id-1');

      expect(result[0].content).toEqual(blocks);
    });

    it('falls back to content string when raw_blocks is null', async () => {
      const msg = makeMessage({ raw_blocks: null, content: 'plain text' });
      messageRepo.find.mockResolvedValue([msg]);

      const result = await service.buildMessageHistory('chat-id-1');

      expect(result[0].content).toBe('plain text');
    });
  });

  describe('saveAssistantMessage', () => {
    it('extracts plain text from ContentBlock[] and saves', async () => {
      const blocks = [
        { type: 'text', text: 'The soil is healthy. ' },
        { type: 'text', text: 'No issues detected.' },
      ];

      const saved = await service.saveAssistantMessage('chat-id-1', blocks as any);

      expect(saved.content).toBe('The soil is healthy. No issues detected.');
      expect(saved.raw_blocks).toEqual(blocks);
      expect(saved.role).toBe(MessageRole.ASSISTANT);
      expect(saved.is_complete).toBe(true);
    });

    it('ignores tool_use blocks when extracting plain text', async () => {
      const blocks = [
        { type: 'tool_use', id: 'tu_1', name: 'get_farm_health', input: {} },
        { type: 'text', text: 'Based on the data, your farm is healthy.' },
      ];

      const saved = await service.saveAssistantMessage('chat-id-1', blocks as any);

      expect(saved.content).toBe('Based on the data, your farm is healthy.');
    });
  });

  describe('getCompletedMessage', () => {
    it('returns null when chat status is not done', async () => {
      chatRepo.findOne.mockResolvedValue(makeChat({ status: 'processing' }));

      const result = await service.getCompletedMessage('chat-id-1', 'farmer-id-1');

      expect(result).toBeNull();
      expect(messageRepo.findOne).not.toHaveBeenCalled();
    });

    it('returns null when chat is not found', async () => {
      chatRepo.findOne.mockResolvedValue(null);

      const result = await service.getCompletedMessage('chat-id-1', 'farmer-id-1');

      expect(result).toBeNull();
    });

    it('returns the latest assistant message when chat is done', async () => {
      chatRepo.findOne.mockResolvedValue(makeChat({ status: 'done' }));
      const assistantMsg = makeMessage({
        role: MessageRole.ASSISTANT,
        content: 'Farm is healthy.',
      });
      messageRepo.findOne.mockResolvedValue(assistantMsg);

      const result = await service.getCompletedMessage('chat-id-1', 'farmer-id-1');

      expect(result).toEqual(assistantMsg);
      expect(messageRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: MessageRole.ASSISTANT, is_complete: true }),
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('markChatDone / markChatError', () => {
    it('updates chat status to done', async () => {
      await service.markChatDone('chat-id-1');
      expect(chatRepo.update).toHaveBeenCalledWith('chat-id-1', { status: 'done' });
    });

    it('updates chat status to error', async () => {
      await service.markChatError('chat-id-1');
      expect(chatRepo.update).toHaveBeenCalledWith('chat-id-1', { status: 'error' });
    });
  });

  describe('verifyToken', () => {
    it('delegates to JwtService.verify and returns the payload', () => {
      const payload = { id: 'farmer-id-1', email: 'farmer@test.com' };
      jwtService.verify.mockReturnValue(payload);

      const result = service.verifyToken('some.jwt.token');

      expect(result).toEqual(payload);
      expect(jwtService.verify).toHaveBeenCalledWith('some.jwt.token');
    });

    it('propagates error when token is invalid', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      expect(() => service.verifyToken('bad.token')).toThrow('invalid signature');
    });
  });
});
