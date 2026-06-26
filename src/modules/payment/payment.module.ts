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
