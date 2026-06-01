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
