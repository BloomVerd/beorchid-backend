import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: ReturnType<typeof Twilio>;
  private readonly fromNumber: string;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER', '');

    if (accountSid && authToken) {
      this.client = Twilio(accountSid, authToken);
    }
  }

  async sendPredictionAlert(
    to: string,
    farmName: string,
    summary: string,
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn('Twilio not configured — skipping SMS');
      return;
    }
    await this.client.messages.create({
      body: `[BeOrchid] ${farmName}: ${summary}`,
      from: this.fromNumber,
      to,
    });
  }
}
