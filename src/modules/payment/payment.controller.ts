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

@Controller('api/payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
    private readonly walletService: WalletService,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
  ) {}

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
