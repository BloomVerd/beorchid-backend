import {
  Controller,
  // Headers,
  // HttpCode,
  // Post,
  // Req,
  // UnauthorizedException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
// import { PaymentService } from '../payment/payment.service';

@Controller('api/v2/webhooks/payments')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    // private readonly paymentService: PaymentService,
  ) {}

  // @Post('paystack')
  // @HttpCode(200)
  // async handlePaystackWebhook(
  //   @Req() req: any,
  //   @Headers('x-paystack-signature') signature: string,
  // ): Promise<{ ok: boolean }> {
  //   const rawBody: Buffer | undefined = req.rawBody as Buffer | undefined;
  //   if (!rawBody) throw new UnauthorizedException('Missing raw body');

  //   const valid = this.paymentService.verifyWebhookSignature(
  //     rawBody,
  //     signature,
  //   );
  //   if (!valid) throw new UnauthorizedException('Invalid webhook signature');

  //   const event = JSON.parse(rawBody.toString()) as {
  //     event: string;
  //     data: { reference: string };
  //   };

  //   if (event.event === 'charge.success') {
  //     await this.walletService.handleDepositWebhook(event.data.reference);
  //   }

  //   return { ok: true };
  // }
}
