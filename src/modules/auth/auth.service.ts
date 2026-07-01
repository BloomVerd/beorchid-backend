import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
import { ChangePasswordInput } from './inputs/change-password.input';
import { AuthPayload, MessageResponse } from './types/auth.types';
import { HashHelper } from 'src/common/lib';
import { EmailProducer } from '../email/email.producer';
import { SubscriptionService } from '../payment/subscription.service';

/**
 * Core authentication service. Implements all sign-in and token-management
 * flows: password login, magic-link (passwordless), Google OAuth upsert,
 * JWT + refresh-token issuance, token rotation, logout, and password changes.
 *
 * Tokens are never stored in plain text — only their SHA-256 digest is
 * persisted so a database leak cannot yield usable credentials.
 */
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
    private subscriptionService: SubscriptionService,
  ) {}

  // ── Registration ────────────────────────────────────────────────────────────

  /**
   * Creates a new farmer account, sends a welcome email, assigns the free
   * subscription plan (best-effort — failure does not abort registration),
   * and returns an initial token pair.
   *
   * @throws BadRequestException if a user with the given email already exists
   */
  async register(input: RegisterInput): Promise<AuthPayload> {
    const existing = await this.farmerRepository.findOne({
      where: { email: input.email },
    });
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists',
      );
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

    // Assign free subscription — best-effort, don't fail registration if plans not seeded yet
    try {
      await this.subscriptionService.assignFreePlan(farmer.id);
    } catch {
      // Plans may not be seeded yet on first boot; subscription will be created on first access
    }

    return this.issueTokens(farmer);
  }

  // ── Magic-link ──────────────────────────────────────────────────────────────

  /**
   * Generates a 32-byte random magic-link token, stores its SHA-256 hash with
   * a 15-minute expiry, and emails the raw token to the user as a sign-in URL.
   *
   * @throws BadRequestException if no account exists for the given email
   */
  async sendMagicLink(
    email: string,
    redirectBase?: string,
  ): Promise<MessageResponse> {
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

    const defaultBase = `${this.configService.get<string>('FRONTEND_URL')}/auth/verify`;
    const base = redirectBase ?? defaultBase;
    const link = `${base}?token=${rawToken}`;

    await this.emailProducer.sendMagicLink({
      email,
      firstName: farmer.firstName,
      link,
    });

    return { message: 'Magic link sent to your email' };
  }

  /**
   * Validates a raw magic-link token by comparing its SHA-256 hash against the
   * database record, ensures it has not been used or expired, marks it as used,
   * and returns a new token pair.
   *
   * @throws UnauthorizedException if the token is invalid, already used, or expired
   */
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

  // ── Password login ──────────────────────────────────────────────────────────

  /**
   * Authenticates a user with email and password. Selects `passwordHash`
   * explicitly (excluded by default) and uses bcrypt comparison.
   *
   * @throws BadRequestException if the email is not found or the password is incorrect
   */
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

  // ── Token rotation ──────────────────────────────────────────────────────────

  /**
   * Rotates a refresh token: validates the hash, deletes the old record, and
   * issues a fresh access + refresh token pair. Each refresh token is
   * single-use — presenting it a second time results in a 401.
   *
   * @throws UnauthorizedException if the token is invalid or expired
   */
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

  /** Invalidates a refresh token by deleting its hashed record from the database. */
  async logout(rawRefreshToken: string): Promise<MessageResponse> {
    const hashedToken = this.hashToken(rawRefreshToken);
    await this.refreshTokenRepository.delete({ token: hashedToken });
    return { message: 'Logged out successfully' };
  }

  // ── Password management ─────────────────────────────────────────────────────

  /**
   * Verifies the caller's current password then replaces the hash with a new one.
   *
   * @throws NotFoundException   if the farmer record no longer exists
   * @throws BadRequestException if the account uses social login (no password set),
   *                             or if `currentPassword` does not match
   */
  async changePassword(
    farmerId: string,
    input: ChangePasswordInput,
  ): Promise<MessageResponse> {
    const farmer = await this.farmerRepository
      .createQueryBuilder('farmer')
      .addSelect('farmer.passwordHash')
      .where('farmer.id = :id', { id: farmerId })
      .getOne();

    if (!farmer) throw new NotFoundException('Farmer not found');

    if (!farmer.passwordHash) {
      throw new BadRequestException(
        'Your account uses social login — set a password via account settings first',
      );
    }

    const valid = await HashHelper.compare(
      input.currentPassword,
      farmer.passwordHash,
    );
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    farmer.passwordHash = await HashHelper.encrypt(input.newPassword);
    await this.farmerRepository.save(farmer);
    return { message: 'Password updated successfully' };
  }

  // ── Google OAuth ────────────────────────────────────────────────────────────

  /**
   * Upserts a farmer from a Google OAuth profile. Matches by email or `googleId`.
   * Creates a new account (with free-plan assignment) if none exists, or links
   * `googleId` to an existing password-based account on first Google sign-in.
   */
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
      try {
        await this.subscriptionService.assignFreePlan(farmer.id);
      } catch {
        // Plans may not be seeded yet; subscription created on first access
      }
    } else if (!farmer.googleId) {
      farmer.googleId = googleUser.googleId;
      await this.farmerRepository.save(farmer);
    }

    return this.issueTokens(farmer);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Signs a JWT access token (24 h) and persists a new hashed refresh token
   * (7 days). Returns both tokens alongside the farmer record.
   */
  private async issueTokens(farmer: Farmer): Promise<AuthPayload> {
    const payload = {
      id: farmer.id,
      email: farmer.email,
      roles: farmer.roles ?? ['farmer'],
      isFieldAgent: farmer.isFieldAgent ?? false,
    };
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

  /** Returns the SHA-256 hex digest of a raw token string. */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
