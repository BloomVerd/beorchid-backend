import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { SubscriptionService } from './subscription.service';

const mockPaymentService = {
  verifyWebhookSignature: jest.fn(),
};
const mockSubscriptionService = {
  activateSubscription: jest.fn(),
};

const makeRawBodyReq = (payload: object, signature: string) => ({
  rawBody: Buffer.from(JSON.stringify(payload)),
  headers: { 'x-paystack-signature': signature },
});

describe('PaymentController', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleWebhook', () => {
    it('activates subscription on charge.success event', async () => {
      const payload = { event: 'charge.success', data: { reference: 'ref_abc' } };
      const req = makeRawBodyReq(payload, 'valid_sig');
      mockPaymentService.verifyWebhookSignature.mockReturnValue(true);
      mockSubscriptionService.activateSubscription.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req as any, 'valid_sig');

      expect(result).toEqual({ ok: true });
      expect(mockSubscriptionService.activateSubscription).toHaveBeenCalledWith('ref_abc');
    });

    it('returns ok:true for unhandled event types (does not call activateSubscription)', async () => {
      const payload = { event: 'transfer.success', data: { reference: 'ref_xyz' } };
      const req = makeRawBodyReq(payload, 'valid_sig');
      mockPaymentService.verifyWebhookSignature.mockReturnValue(true);

      const result = await controller.handleWebhook(req as any, 'valid_sig');

      expect(result).toEqual({ ok: true });
      expect(mockSubscriptionService.activateSubscription).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when signature is invalid', async () => {
      const payload = { event: 'charge.success', data: { reference: 'ref_abc' } };
      const req = makeRawBodyReq(payload, 'bad_sig');
      mockPaymentService.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        controller.handleWebhook(req as any, 'bad_sig'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSubscriptionService.activateSubscription).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when rawBody is missing', async () => {
      const req = { rawBody: undefined };

      await expect(
        controller.handleWebhook(req as any, 'any_sig'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
