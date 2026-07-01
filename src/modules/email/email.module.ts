/**
 * Email module — asynchronous transactional email delivery.
 *
 * Callers import this module and inject `EmailProducer` to enqueue email jobs.
 * `EmailProcessor` (BullMQ worker) dequeues jobs and delegates to `EmailService`,
 * which compiles Handlebars templates and sends via Gmail (production) or
 * Ethereal (development). Only `EmailProducer` is exported.
 */
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailProducer } from './email.producer';
import { EmailProcessor } from './email.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: 'email' }),
  ],
  providers: [EmailService, EmailProducer, EmailProcessor],
  exports: [EmailProducer],
})
export class EmailModule {}
