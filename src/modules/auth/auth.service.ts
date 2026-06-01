import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Farmer } from '../farmer/entities/farmer.entity';
import { MagicLinkToken } from './entities/magic-link-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterInput } from './inputs/register.input';
import { AuthPayload, MessageResponse } from './types/auth.types';
import { HashHelper } from 'common/lib';
import { EmailProducer } from '../email/email.producer';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Farmer)
    private farmerRepository: Repository<Farmer>,
    @InjectRepository(MagicLinkToken)
    private magicLinkTokenRepository: Repository<MagicLinkToken>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailProducer: EmailProducer,
  ) {}

  async register(input: RegisterInput): Promise<AuthPayload> {
    const existing = await this.farmerRepository.findOne({
      where: { email: input.email },
    });
    if (existing) {
      throw new BadRequestException('An account with this email already exists');
    }

    const farmer = this.farmerRepository.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      country: input.country,
      passwordHash: await HashHelper.encrypt(input.password),
    });
    await this.farmerRepository.save(farmer);

    await this.emailProducer.sendWelcomeEmail({
      email: farmer.email,
      firstName: farmer.firstName,
    });

    return this.issueTokens(farmer);
  }

  async sendMagicLink(email: string): Promise<MessageResponse> {
    let farmer = await this.farmerRepository.findOne({ where: { email } });
    if (!farmer) {
      throw new BadRequestException('No account found with this email');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const magicLink = this.magicLinkTokenRepository.create({
      email,
      token: hashedToken,
      expiresAt,
    });
    await this.magicLinkTokenRepository.save(magicLink);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const link = `${frontendUrl}/auth/verify?token=${rawToken}`;

    await this.emailProducer.sendMagicLink({ email, firstName: farmer.firstName, link });

    return { message: 'Magic link sent to your email' };
  }

  async verifyMagicLink(rawToken: string): Promise<AuthPayload> {
    const hashedToken = this.hashToken(rawToken);

    const record = await this.magicLinkTokenRepository.findOne({
      where: { token: hashedToken },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }
    if (record.usedAt) {
      throw new UnauthorizedException('Magic link has already been used');
    }
    if (new Date() > record.expiresAt) {
      throw new UnauthorizedException('Magic link has expired');
    }

    record.usedAt = new Date();
    await this.magicLinkTokenRepository.save(record);

    const farmer = await this.farmerRepository.findOne({
      where: { email: record.email },
    });
    if (!farmer) {
      throw new UnauthorizedException('Account not found');
    }

    return this.issueTokens(farmer);
  }

  async loginWithPassword(
    email: string,
    password: string,
  ): Promise<AuthPayload> {
    const farmer = await this.farmerRepository
      .createQueryBuilder('farmer')
      .addSelect('farmer.passwordHash')
      .where('farmer.email = :email', { email })
      .getOne();

    if (!farmer || !farmer.passwordHash) {
      throw new BadRequestException('Email or password is incorrect');
    }

    const valid = await HashHelper.compare(password, farmer.passwordHash);
    if (!valid) {
      throw new BadRequestException('Email or password is incorrect');
    }

    return this.issueTokens(farmer);
  }

  async refresh(rawRefreshToken: string): Promise<AuthPayload> {
    const hashedToken = this.hashToken(rawRefreshToken);
    const record = await this.refreshTokenRepository.findOne({
      where: { token: hashedToken },
      relations: ['farmer'],
    });

    if (!record || new Date() > record.expiresAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.refreshTokenRepository.delete(record.id);
    return this.issueTokens(record.farmer);
  }

  async logout(rawRefreshToken: string): Promise<MessageResponse> {
    const hashedToken = this.hashToken(rawRefreshToken);
    await this.refreshTokenRepository.delete({ token: hashedToken });
    return { message: 'Logged out successfully' };
  }

  async handleGoogleLogin(googleUser: {
    email: string;
    firstName: string;
    lastName: string;
    googleId: string;
  }): Promise<AuthPayload> {
    let farmer = await this.farmerRepository.findOne({
      where: [{ email: googleUser.email }, { googleId: googleUser.googleId }],
    });

    if (!farmer) {
      farmer = this.farmerRepository.create({
        email: googleUser.email,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        country: '',
        googleId: googleUser.googleId,
      });
      await this.farmerRepository.save(farmer);
    } else if (!farmer.googleId) {
      farmer.googleId = googleUser.googleId;
      await this.farmerRepository.save(farmer);
    }

    return this.issueTokens(farmer);
  }

  private async issueTokens(farmer: Farmer): Promise<AuthPayload> {
    const payload = { id: farmer.id, email: farmer.email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const hashedRefreshToken = this.hashToken(rawRefreshToken);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const refreshRecord = this.refreshTokenRepository.create({
      farmerId: farmer.id,
      token: hashedRefreshToken,
      expiresAt,
    });
    await this.refreshTokenRepository.save(refreshRecord);

    return { farmer, accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
