import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Enqueues email jobs onto the `email` BullMQ queue.
 *
 * Each method corresponds to one Handlebars template and one BullMQ job name.
 * Callers (auth, payment, farm services) invoke these methods rather than
 * calling `EmailService` directly so that email delivery is decoupled from the
 * request path and retried automatically on failure.
 */
@Injectable()
export class EmailProducer {
  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  // ── Queue methods ────────────────────────────────────────────────────────

  /** Enqueues a `send-magic-link` job. */
  async sendMagicLink(data: {
    email: string;
    firstName: string;
    link: string;
  }) {
    await this.emailQueue.add('send-magic-link', data);
  }

  /** Enqueues a `welcome-email` job. */
  async sendWelcomeEmail(data: { email: string; firstName: string }) {
    await this.emailQueue.add('welcome-email', data);
  }

  /** Enqueues a `prediction-alert` job. */
  async sendPredictionAlert(data: {
    email: string;
    firstName: string;
    farmName: string;
    summary: string;
  }) {
    await this.emailQueue.add('prediction-alert', data);
  }

  /** Enqueues a `health-alert` job. */
  async sendHealthAlert(data: {
    email: string;
    firstName: string;
    farmName: string;
    summary: string;
  }) {
    await this.emailQueue.add('health-alert', data);
  }

  /** Enqueues a `subscription-activated` job. */
  async sendSubscriptionActivated(data: {
    email: string;
    firstName: string;
    planName: string;
    summary: string;
  }) {
    await this.emailQueue.add('subscription-activated', data);
  }

  /** Enqueues a `farm-setup-complete` job. */
  async sendFarmSetupComplete(data: {
    email: string;
    firstName: string;
    farmName: string;
  }) {
    await this.emailQueue.add('farm-setup-complete', data);
  }

  /** Enqueues a `super-admin-credentials` job. */
  async sendSuperAdminCredentials(data: {
    email: string;
    firstName: string;
    password: string;
  }) {
    await this.emailQueue.add('super-admin-credentials', data);
  }
}
