import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { PaymentService } from './payment.service';

const FAKE_SECRET = 'sk_test_fakesecret';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(FAKE_SECRET) },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('initializeTransaction', () => {
    it('returns authorizationUrl and accessCode on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: true,
          data: {
            authorization_url: 'https://paystack.com/pay/abc123',
            access_code: 'access_abc',
            reference: 'ref_abc',
          },
        }),
      });

      const result = await service.initializeTransaction(
        'farmer@example.com',
        2000,
        'ref_abc',
        { planId: 'plan-1' },
      );

      expect(result).toEqual({
        authorizationUrl: 'https://paystack.com/pay/abc123',
        accessCode: 'access_abc',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.paystack.co/transaction/initialize',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${FAKE_SECRET}`,
          }),
        }),
      );
    });

    it('throws InternalServerErrorException when Paystack returns non-ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: jest.fn().mockResolvedValue('Bad Request'),
      });

      await expect(
        service.initializeTransaction('farmer@example.com', 2000, 'ref', {}),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('verifyTransaction', () => {
    it('returns transaction data on success', async () => {
      const txData = {
        status: 'success',
        reference: 'ref_abc',
        amount: 2000,
        currency: 'GHS',
        customer: { email: 'farmer@example.com', customer_code: 'CUS_abc' },
        metadata: {},
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: true, data: txData }),
      });

      const result = await service.verifyTransaction('ref_abc');

      expect(result).toEqual(txData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.paystack.co/transaction/verify/ref_abc',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${FAKE_SECRET}`,
          }),
        }),
      );
    });

    it('throws InternalServerErrorException when Paystack returns non-ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: jest.fn().mockResolvedValue('Not Found'),
      });

      await expect(service.verifyTransaction('bad_ref')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('returns true for a valid HMAC-SHA512 signature', () => {
      const crypto = require('crypto');
      const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const signature = crypto
        .createHmac('sha512', FAKE_SECRET)
        .update(body)
        .digest('hex');

      expect(service.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('returns false for a tampered signature', () => {
      const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      expect(
        service.verifyWebhookSignature(body, 'bad_signature_value'),
      ).toBe(false);
    });

    it('returns false when body does not match signature', () => {
      const crypto = require('crypto');
      const originalBody = Buffer.from('{"event":"charge.success"}');
      const tamperedBody = Buffer.from('{"event":"charge.failed"}');
      const signature = crypto
        .createHmac('sha512', FAKE_SECRET)
        .update(originalBody)
        .digest('hex');

      expect(service.verifyWebhookSignature(tamperedBody, signature)).toBe(false);
    });
  });
});
