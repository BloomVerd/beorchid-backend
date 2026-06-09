import { Test, TestingModule } from '@nestjs/testing';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';

const makeJob = (name: string, data: object) => ({ name, data });

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let emailService: {
    sendMagicLink: jest.Mock;
    sendWelcomeEmail: jest.Mock;
    sendPredictionAlert: jest.Mock;
  };

  beforeEach(async () => {
    emailService = {
      sendMagicLink: jest.fn().mockResolvedValue(undefined),
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPredictionAlert: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  it('dispatches send-magic-link to emailService.sendMagicLink', async () => {
    const data = { email: 'u@example.com', firstName: 'Alice', link: 'https://app/magic' };

    await processor.process(makeJob('send-magic-link', data) as any);

    expect(emailService.sendMagicLink).toHaveBeenCalledWith(
      data.email,
      data.firstName,
      data.link,
    );
  });

  it('dispatches welcome-email to emailService.sendWelcomeEmail', async () => {
    const data = { email: 'u@example.com', firstName: 'Alice' };

    await processor.process(makeJob('welcome-email', data) as any);

    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
      data.email,
      data.firstName,
    );
  });

  it('dispatches prediction-alert to emailService.sendPredictionAlert', async () => {
    const data = {
      email: 'farmer@example.com',
      firstName: 'John',
      farmName: 'Farm A',
      summary: '2 high-risk prediction(s) detected.',
    };

    await processor.process(makeJob('prediction-alert', data) as any);

    expect(emailService.sendPredictionAlert).toHaveBeenCalledWith(
      data.email,
      data.firstName,
      data.farmName,
      data.summary,
    );
  });

  it('is a no-op for unknown job names', async () => {
    await processor.process(makeJob('unknown-job', {}) as any);

    expect(emailService.sendMagicLink).not.toHaveBeenCalled();
    expect(emailService.sendWelcomeEmail).not.toHaveBeenCalled();
    expect(emailService.sendPredictionAlert).not.toHaveBeenCalled();
  });
});
