import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { SubscriptionService } from './subscription.service';
import { WalletService } from '../wallet/wallet.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentTransaction } from './entities/payment-transaction.entity';

const mockPaymentService = {
  verifyWebhookSignature: jest.fn(),
};
const mockWalletService = {
  initializeTransaction: jest.fn(),
  handleDepositWebhook: jest.fn(),
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
  let transactionRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    transactionRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: getRepositoryToken(PaymentTransaction),
          useValue: transactionRepo,
        },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleWebhook', () => {
    it('activates subscription on charge.success event', async () => {
      const payload = {
        event: 'charge.success',
        data: { reference: 'ref_abc' },
      };

      transactionRepo.findOne.mockResolvedValue({ id: 'trans-id' });
      transactionRepo.create.mockReturnValue({ id: 'trans-id' });
      transactionRepo.save.mockResolvedValue({ id: 'trans-id' });

      const req = makeRawBodyReq(payload, 'valid_sig');
      mockPaymentService.verifyWebhookSignature.mockReturnValue(true);
      mockSubscriptionService.activateSubscription.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req as any, 'valid_sig');

      expect(result).toEqual({ ok: true });
      expect(mockSubscriptionService.activateSubscription).toHaveBeenCalledWith(
        'ref_abc',
      );
    });

    it('returns ok:true for unhandled event types (does not call activateSubscription)', async () => {
      const payload = {
        event: 'transfer.success',
        data: { reference: 'ref_xyz' },
      };
      const req = makeRawBodyReq(payload, 'valid_sig');
      mockPaymentService.verifyWebhookSignature.mockReturnValue(true);

      const result = await controller.handleWebhook(req as any, 'valid_sig');

      expect(result).toEqual({ ok: true });
      expect(
        mockSubscriptionService.activateSubscription,
      ).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when signature is invalid', async () => {
      const payload = {
        event: 'charge.success',
        data: { reference: 'ref_abc' },
      };
      const req = makeRawBodyReq(payload, 'bad_sig');
      mockPaymentService.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        controller.handleWebhook(req as any, 'bad_sig'),
      ).rejects.toThrow(UnauthorizedException);

      expect(
        mockSubscriptionService.activateSubscription,
      ).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when rawBody is missing', async () => {
      const req = { rawBody: undefined };

      await expect(
        controller.handleWebhook(req as any, 'any_sig'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
