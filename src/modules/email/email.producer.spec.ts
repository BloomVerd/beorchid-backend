import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EmailProducer } from './email.producer';

describe('EmailProducer', () => {
  let producer: EmailProducer;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProducer,
        { provide: getQueueToken('email'), useValue: mockQueue },
      ],
    }).compile();

    producer = module.get<EmailProducer>(EmailProducer);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendMagicLink', () => {
    it('adds send-magic-link job to the queue', async () => {
      const data = { email: 'user@example.com', firstName: 'Alice', link: 'https://app.com/verify?token=abc' };

      await producer.sendMagicLink(data);

      expect(mockQueue.add).toHaveBeenCalledWith('send-magic-link', data);
    });
  });

  describe('sendWelcomeEmail', () => {
    it('adds welcome-email job to the queue', async () => {
      const data = { email: 'user@example.com', firstName: 'Alice' };

      await producer.sendWelcomeEmail(data);

      expect(mockQueue.add).toHaveBeenCalledWith('welcome-email', data);
    });
  });

  describe('sendPredictionAlert', () => {
    it('adds prediction-alert job to the queue with all fields', async () => {
      const data = {
        email: 'farmer@example.com',
        firstName: 'John',
        farmName: 'Farm A',
        summary: '2 high-risk prediction(s) detected.',
      };

      await producer.sendPredictionAlert(data);

      expect(mockQueue.add).toHaveBeenCalledWith('prediction-alert', data);
    });
  });
});
