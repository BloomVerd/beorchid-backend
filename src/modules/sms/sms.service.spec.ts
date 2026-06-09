const mockMessagesCreate = jest.fn().mockResolvedValue({ sid: 'SM123' });

jest.mock('twilio', () =>
  jest.fn().mockReturnValue({
    messages: { create: mockMessagesCreate },
  }),
);

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  let service: SmsService;
  let mockConfigService: { get: jest.Mock };

  const makeConfigService = (overrides: Record<string, string> = {}) => ({
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, string> = {
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'authtoken',
        TWILIO_FROM_NUMBER: '+10000000000',
        ...overrides,
      };
      return config[key];
    }),
  });

  afterEach(() => jest.clearAllMocks());

  describe('when Twilio credentials are configured', () => {
    beforeEach(async () => {
      mockConfigService = makeConfigService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      service = module.get<SmsService>(SmsService);
    });

    it('sends an SMS with the farm name and summary in the body', async () => {
      await service.sendPredictionAlert('+19999999999', 'Farm A', '1 high-risk prediction(s) detected.');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+19999999999',
          from: '+10000000000',
          body: '[BeOrchid] Farm A: 1 high-risk prediction(s) detected.',
        }),
      );
    });
  });

  describe('when Twilio credentials are missing', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      service = module.get<SmsService>(SmsService);
    });

    it('skips sending without throwing', async () => {
      await expect(
        service.sendPredictionAlert('+19999999999', 'Farm A', 'summary'),
      ).resolves.not.toThrow();

      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });
  });
});
