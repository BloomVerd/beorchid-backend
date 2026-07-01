import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { SubscriptionService } from './subscription.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

/**
 * REST controller for Paystack payment webhooks. Mounted at
 * `POST /api/payment/webhook`.
 *
 * On every `charge.success` event:
 *  1. Verifies the `x-paystack-signature` header using HMAC-SHA512.
 *  2. Looks up whether a `PaymentTransaction` row exists for the reference.
 *     - If yes → subscription payment: delegates to `SubscriptionService.activateSubscription`.
 *     - If no  → direct wallet deposit: delegates to `WalletService.handleDepositWebhook`.
 *
 * NestJS must be configured to expose `req.rawBody` (Buffer) for signature
 * verification to work — enable `rawBody: true` in `NestFactory.create`.
 */
@Controller('api/payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
    private readonly walletService: WalletService,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
  ) {}

  /**
   * Handles Paystack `charge.success` webhooks. Verifies the signature,
   * dispatches to either `SubscriptionService` or `WalletService`, and
   * returns `{ ok: true }` with HTTP 200 on success.
   *
   * @throws UnauthorizedException if the raw body is missing or the signature is invalid
   */
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: any,
    @Headers('x-paystack-signature') signature: string,
  ): Promise<{ ok: boolean }> {
    const rawBody: Buffer | undefined = req.rawBody as Buffer | undefined;
    if (!rawBody) throw new UnauthorizedException('Missing raw body');

    const valid = this.paymentService.verifyWebhookSignature(
      rawBody,
      signature,
    );
    if (!valid) throw new UnauthorizedException('Invalid webhook signature');

    const event = JSON.parse(rawBody.toString()) as {
      event: string;
      data: { reference: string };
    };

    if (event.event === 'charge.success') {
      const transaction = await this.transactionRepo.findOne({
        where: { paystackReference: event.data.reference },
      });

      if (transaction) {
        await this.subscriptionService.activateSubscription(
          event.data.reference,
        );
      } else {
        await this.walletService.handleDepositWebhook(event.data.reference);
      }
    }

    return { ok: true };
  }
}
