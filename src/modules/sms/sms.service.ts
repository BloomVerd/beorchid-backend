import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

/**
 * Sends transactional SMS messages via the Twilio API.
 *
 * The Twilio client is initialized in the constructor only when
 * `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are present. When credentials
 * are absent every `send*()` call logs a warning and returns early — allowing
 * the app to run without SMS configured (e.g. local dev).
 *
 * Callers are responsible for checking `FarmerSettings.notifySms` and
 * `FarmerSettings.smsPhoneNumber` before invoking these methods.
 */
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

  // ── Public send methods ──────────────────────────────────────────────────

  /** Sends a prediction alert SMS: `[BeOrchid] {farmName}: {summary}`. */
  async sendPredictionAlert(
    to: string,
    farmName: string,
    summary: string,
  ): Promise<void> {
    await this.send(to, `[BeOrchid] ${farmName}: ${summary}`);
  }

  /** Sends a health alert SMS: `[BeOrchid Health] {farmName}: {summary}`. */
  async sendHealthAlert(
    to: string,
    farmName: string,
    summary: string,
  ): Promise<void> {
    await this.send(to, `[BeOrchid Health] ${farmName}: ${summary}`);
  }

  /** Sends a subscription activation confirmation: `[BeOrchid] Your {planName} plan is now active.` */
  async sendSubscriptionActivated(
    to: string,
    planName: string,
  ): Promise<void> {
    await this.send(to, `[BeOrchid] Your ${planName} plan is now active.`);
  }

  /** Notifies the farmer that their farm setup is complete and health monitoring is active. */
  async sendFarmSetupComplete(to: string, farmName: string): Promise<void> {
    await this.send(
      to,
      `[BeOrchid] ${farmName} setup is complete. Health monitoring is now active.`,
    );
  }

  // ── Internal helper ──────────────────────────────────────────────────────

  /**
   * Dispatches a raw SMS via Twilio. No-ops with a warning when the client
   * was not initialized due to missing credentials.
   */
  private async send(to: string, body: string): Promise<void> {
    if (!this.client) {
      this.logger.warn('Twilio not configured — skipping SMS');
      return;
    }
    await this.client.messages.create({ body, from: this.fromNumber, to });
  }
}
