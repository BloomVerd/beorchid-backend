import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { FarmerSubscription } from './entities/farmer-subscription.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionService } from './subscription.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { SubscriptionResolver } from './subscription.resolver';
import { FarmerModule } from '../farmer/farmer.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { WalletModule } from '../wallet/wallet.module';

/**
 * Payment module — Paystack-powered subscription lifecycle management.
 *
 * Three service layers:
 *  - `SubscriptionPlanService` — seeds and queries the three plan tiers
 *    (FREE, POPULAR, PREMIUM) from the `subscription_plans` table.
 *  - `SubscriptionService` — orchestrates the full subscription lifecycle:
 *    free-plan auto-assignment, Paystack payment initiation with proration
 *    credit, activation on webhook, and multi-channel activation notifications.
 *  - `PaymentService` — thin Paystack API client (initialize, verify,
 *    webhook HMAC-SHA512 signature verification).
 *
 * Webhook flow:
 *  `POST /api/payment/webhook` (PaymentController) verifies the Paystack
 *  signature and dispatches to either `SubscriptionService.activateSubscription`
 *  (subscription payments) or `WalletService.handleDepositWebhook` (direct
 *  deposits), distinguished by whether a `PaymentTransaction` row exists for
 *  the reference.
 *
 * Exports `SubscriptionPlanService`, `SubscriptionService`, and `PaymentService`
 * for use by other modules (farmer registration, wallet, etc.).
 */
@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    NotificationsModule,
    EmailModule,
    SmsModule,
    WalletModule,
    TypeOrmModule.forFeature([
      SubscriptionPlan,
      FarmerSubscription,
      PaymentTransaction,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [PaymentController],
  providers: [
    SubscriptionPlanService,
    SubscriptionService,
    PaymentService,
    SubscriptionResolver,
  ],
  exports: [SubscriptionPlanService, SubscriptionService, PaymentService],
})
export class PaymentModule {}
