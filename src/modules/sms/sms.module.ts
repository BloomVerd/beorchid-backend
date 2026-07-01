import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';

/**
 * Thin wrapper around the Twilio SDK. Exports `SmsService` so health,
 * prediction, and farm modules can send SMS notifications without taking a
 * direct Twilio dependency. No queue — SMS is dispatched synchronously
 * within the calling worker's job context.
 */
@Module({
  imports: [ConfigModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
