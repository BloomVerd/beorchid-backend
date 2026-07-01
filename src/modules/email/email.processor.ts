import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EmailService } from './email.service';

/**
 * BullMQ worker for the `email` queue. Dispatches each job name to the
 * corresponding `EmailService` method. Retries are handled by BullMQ's
 * default exponential back-off; failed jobs land in the `failed` bucket
 * for inspection.
 */
@Processor('email')
export class EmailProcessor extends WorkerHost {
  constructor(private readonly emailService: EmailService) {
    super();
  }

  /** Routes each job by name to the appropriate `EmailService` send method. */
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'send-magic-link': {
        const { email, firstName, link } = job.data;
        await this.emailService.sendMagicLink(email, firstName, link);
        break;
      }
      case 'welcome-email': {
        const { email, firstName } = job.data;
        await this.emailService.sendWelcomeEmail(email, firstName);
        break;
      }
      case 'prediction-alert': {
        const { email, firstName, farmName, summary } = job.data;
        await this.emailService.sendPredictionAlert(email, firstName, farmName, summary);
        break;
      }
      case 'health-alert': {
        const { email, firstName, farmName, summary } = job.data;
        await this.emailService.sendHealthAlert(email, firstName, farmName, summary);
        break;
      }
      case 'subscription-activated': {
        const { email, firstName, planName, summary } = job.data;
        await this.emailService.sendSubscriptionActivated(email, firstName, planName, summary);
        break;
      }
      case 'farm-setup-complete': {
        const { email, firstName, farmName } = job.data;
        await this.emailService.sendFarmSetupComplete(email, firstName, farmName);
        break;
      }
      case 'super-admin-credentials': {
        const { email, firstName, password } = job.data;
        await this.emailService.sendSuperAdminCredentials(email, firstName, email, password);
        break;
      }
    }
  }
}
