const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({ sendMail: mockSendMail }),
  createTestAccount: jest.fn().mockResolvedValue({ user: 'test-user', pass: 'test-pass' }),
  getTestMessageUrl: jest.fn().mockReturnValue(null),
}));

jest.mock('node:fs', () => ({
  readFileSync: jest.fn().mockReturnValue('<p>{{firstName}}</p>'),
}));

jest.mock('handlebars', () => ({
  compile: jest.fn().mockReturnValue(() => '<p>Test HTML</p>'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          STAGE: 'development',
          GMAIL_USER: 'test@gmail.com',
          GMAIL_APP_PASSWORD: 'app-password',
          EMAIL_FROM: 'noreply@beorchid.com',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendMagicLink', () => {
    it('calls sendMail with magic link subject and recipient', async () => {
      await service.sendMagicLink('user@example.com', 'Alice', 'https://app.com/verify?token=abc');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Your magic link to sign in',
        }),
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    it('calls sendMail with welcome subject and recipient', async () => {
      await service.sendWelcomeEmail('user@example.com', 'Alice');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome to BeOrchid!',
        }),
      );
    });
  });

  describe('sendPredictionAlert', () => {
    it('calls sendMail with prediction alert subject and recipient', async () => {
      await service.sendPredictionAlert(
        'farmer@example.com',
        'John',
        'Farm A',
        '1 high-risk prediction(s) detected.',
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'farmer@example.com',
          subject: 'Prediction Alert — Farm A',
        }),
      );
    });
  });
});
