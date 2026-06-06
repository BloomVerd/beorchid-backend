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

@Controller('api/payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
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
      await this.subscriptionService.activateSubscription(event.data.reference);
    }

    return { ok: true };
  }
}
