import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EmailService } from './email.service';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  constructor(private readonly emailService: EmailService) {
    super();
  }

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
        await this.emailService.sendPredictionAlert(
          email,
          firstName,
          farmName,
          summary,
        );
        break;
      }
    }
  }
}
