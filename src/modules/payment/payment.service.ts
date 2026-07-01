import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    customer: { email: string; customer_code: string };
    metadata: Record<string, unknown>;
  };
}

/**
 * Thin Paystack API client for payment initialization, transaction
 * verification, and webhook signature validation.
 *
 * Used by:
 *  - `SubscriptionService` — to initiate and verify subscription payments.
 *  - `WalletService` — to initiate deposit transactions.
 *  - `PaymentController` — to verify `x-paystack-signature` on incoming webhooks.
 *
 * All outbound API calls use `fetch`. On non-OK responses, the raw Paystack
 * error body is included in the `InternalServerErrorException` message.
 */
@Injectable()
export class PaymentService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') ?? '';
  }

  /**
   * Calls `POST /transaction/initialize` on the Paystack API and returns the
   * checkout URL and access code.
   *
   * @throws InternalServerErrorException if the Paystack API returns a non-OK response
   */
  async initializeTransaction(
    email: string,
    amount: number,
    reference: string,
    metadata: Record<string, unknown> = {},
    callbackUrl?: string,
  ): Promise<{ authorizationUrl: string; accessCode: string }> {
    const body: Record<string, unknown> = {
      email,
      amount,
      reference,
      metadata,
    };
    if (callbackUrl) body.callback_url = callbackUrl;

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Paystack initialization failed: ${body}`,
      );
    }

    const result = (await response.json()) as PaystackInitResponse;
    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
    };
  }

  /**
   * Calls `GET /transaction/verify/:reference` and returns Paystack's
   * transaction data (status, amount, customer, metadata).
   *
   * @throws InternalServerErrorException if the Paystack API returns a non-OK response
   */
  async verifyTransaction(
    reference: string,
  ): Promise<PaystackVerifyResponse['data']> {
    const response = await fetch(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Paystack verification failed: ${body}`,
      );
    }

    const result = (await response.json()) as PaystackVerifyResponse;
    return result.data;
  }

  /**
   * Verifies a Paystack webhook signature using HMAC-SHA512 over the raw
   * request body. Returns `true` if the signature matches.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    return hash === signature;
  }
}
