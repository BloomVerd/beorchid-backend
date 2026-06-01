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

@Module({
  imports: [
    ConfigModule,
    FarmerModule,
    EmailModule,
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
