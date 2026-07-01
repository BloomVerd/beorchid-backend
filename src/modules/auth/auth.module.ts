/**
 * Auth module — handles all authentication flows for the platform.
 *
 * Supports password login, passwordless magic-link sign-in, Google OAuth 2.0,
 * JWT access-token issuance (24 h), refresh-token rotation (7 days), logout,
 * and in-session password changes. Tokens are stored as SHA-256 hashes so
 * that a database compromise does not expose usable credentials.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { AuthController } from './auth.controller';
import { MagicLinkToken } from './entities/magic-link-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { GoogleStrategy } from './strategies/google.strategy';
import { FarmerModule } from '../farmer/farmer.module';
import { EmailModule } from '../email/email.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    EmailModule,
    PaymentModule,
    TypeOrmModule.forFeature([MagicLinkToken, RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthResolver, GoogleStrategy],
})
export class AuthModule {}
