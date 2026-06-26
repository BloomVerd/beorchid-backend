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

@Injectable()
export class PaymentService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') ?? '';
  }

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

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');
    return hash === signature;
  }
}
