import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class EmailProducer {
  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  async sendMagicLink(data: {
    email: string;
    firstName: string;
    link: string;
  }) {
    await this.emailQueue.add('send-magic-link', data);
  }

  async sendWelcomeEmail(data: { email: string; firstName: string }) {
    await this.emailQueue.add('welcome-email', data);
  }

  async sendPredictionAlert(data: {
    email: string;
    firstName: string;
    farmName: string;
    summary: string;
  }) {
    await this.emailQueue.add('prediction-alert', data);
  }
}
