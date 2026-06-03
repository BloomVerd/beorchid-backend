import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Farmer } from '../farmer/entities/farmer.entity';
import { MagicLinkToken } from './entities/magic-link-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { EmailProducer } from '../email/email.producer';
import { HashHelper } from 'src/common/lib';

const makeFarmer = (overrides: Partial<Farmer> = {}): Farmer =>
  ({
    id: 'farmer-uuid-1',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    country: 'GH',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    farms: [],
    ...overrides,
  }) as Farmer;

const makeQBChain = (result: any) => ({
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result),
});

describe('AuthService', () => {
  let service: AuthService;
  let farmerRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let magicLinkRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let refreshTokenRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let emailProducer: { sendWelcomeEmail: jest.Mock; sendMagicLink: jest.Mock };

  beforeEach(async () => {
    farmerRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    magicLinkRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    refreshTokenRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed_access_token') };
    configService = { get: jest.fn().mockReturnValue('http://localhost:3000') };
    emailProducer = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendMagicLink: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Farmer), useValue: farmerRepo },
        {
          provide: getRepositoryToken(MagicLinkToken),
          useValue: magicLinkRepo,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: EmailProducer, useValue: emailProducer },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest
      .spyOn(HashHelper, 'encrypt')
      .mockResolvedValue('hashed_password' as never);
    jest.spyOn(HashHelper, 'compare').mockResolvedValue(true as never);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('creates a new farmer and returns auth payload', async () => {
      const farmer = makeFarmer();
      farmerRepo.findOne.mockResolvedValue(null);
      farmerRepo.create.mockReturnValue(farmer);
      farmerRepo.save.mockResolvedValue(farmer);
      refreshTokenRepo.create.mockReturnValue({
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(),
        farmerId: farmer.id,
      });
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.register({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        country: 'GH',
        password: 'password123',
      });

      expect(result).toMatchObject({
        farmer,
        accessToken: 'signed_access_token',
      });
      expect(result.refreshToken).toBeDefined();
      expect(emailProducer.sendWelcomeEmail).toHaveBeenCalledWith({
        email: farmer.email,
        firstName: farmer.firstName,
      });
    });

    it('throws BadRequestException if email already exists', async () => {
      farmerRepo.findOne.mockResolvedValue(makeFarmer());

      await expect(
        service.register({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          country: 'GH',
          password: 'password123',
        }),
      ).rejects.toThrow(
        new BadRequestException('An account with this email already exists'),
      );
    });
  });

  describe('sendMagicLink', () => {
    it('saves a magic link token and sends email', async () => {
      const farmer = makeFarmer();
      farmerRepo.findOne.mockResolvedValue(farmer);
      magicLinkRepo.create.mockReturnValue({
        id: 'ml-1',
        email: farmer.email,
        token: 'hashed',
        expiresAt: new Date(),
      });
      magicLinkRepo.save.mockResolvedValue({});

      const result = await service.sendMagicLink('john@example.com');

      expect(result).toEqual({ message: 'Magic link sent to your email' });
      expect(emailProducer.sendMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          email: farmer.email,
          firstName: farmer.firstName,
        }),
      );
      const callArgs = (emailProducer.sendMagicLink as jest.Mock).mock
        .calls[0][0];
      expect(callArgs.link).toContain('http://localhost:3000');
    });

    it('throws BadRequestException for unknown email', async () => {
      farmerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.sendMagicLink('unknown@example.com'),
      ).rejects.toThrow(
        new BadRequestException('No account found with this email'),
      );
    });
  });

  describe('verifyMagicLink', () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 1000);

    it('verifies a valid magic link and returns auth payload', async () => {
      const farmer = makeFarmer();
      const record = {
        token: 'hashed',
        email: farmer.email,
        usedAt: null,
        expiresAt: futureDate,
      };
      magicLinkRepo.findOne.mockResolvedValue(record);
      magicLinkRepo.save.mockResolvedValue({ ...record, usedAt: new Date() });
      farmerRepo.findOne.mockResolvedValue(farmer);
      refreshTokenRepo.create.mockReturnValue({
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(),
      });
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.verifyMagicLink('raw_token_value');

      expect(result).toMatchObject({
        farmer,
        accessToken: 'signed_access_token',
      });
      expect(magicLinkRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
    });

    it('throws UnauthorizedException for token not found', async () => {
      magicLinkRepo.findOne.mockResolvedValue(null);

      await expect(service.verifyMagicLink('invalid_token')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired magic link'),
      );
    });

    it('throws UnauthorizedException for already-used token', async () => {
      magicLinkRepo.findOne.mockResolvedValue({
        token: 'hashed',
        email: 'john@example.com',
        usedAt: new Date(Date.now() - 1000),
        expiresAt: futureDate,
      });

      await expect(service.verifyMagicLink('used_token')).rejects.toThrow(
        new UnauthorizedException('Magic link has already been used'),
      );
    });

    it('throws UnauthorizedException for expired token', async () => {
      magicLinkRepo.findOne.mockResolvedValue({
        token: 'hashed',
        email: 'john@example.com',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyMagicLink('expired_token')).rejects.toThrow(
        new UnauthorizedException('Magic link has expired'),
      );
    });
  });

  describe('loginWithPassword', () => {
    it('returns auth payload for correct credentials', async () => {
      const farmer = makeFarmer({ passwordHash: 'hashed_password' } as any);
      farmerRepo.createQueryBuilder.mockReturnValue(makeQBChain(farmer));
      refreshTokenRepo.create.mockReturnValue({
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(),
      });
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.loginWithPassword(
        'john@example.com',
        'password123',
      );

      expect(result).toMatchObject({
        farmer,
        accessToken: 'signed_access_token',
      });
    });

    it('throws BadRequestException when farmer is not found', async () => {
      farmerRepo.createQueryBuilder.mockReturnValue(makeQBChain(null));

      await expect(
        service.loginWithPassword('unknown@example.com', 'password'),
      ).rejects.toThrow(
        new BadRequestException('Email or password is incorrect'),
      );
    });

    it('throws BadRequestException when password is wrong', async () => {
      const farmer = makeFarmer({ passwordHash: 'hashed_password' } as any);
      farmerRepo.createQueryBuilder.mockReturnValue(makeQBChain(farmer));
      jest.spyOn(HashHelper, 'compare').mockResolvedValue(false as never);

      await expect(
        service.loginWithPassword('john@example.com', 'wrong_password'),
      ).rejects.toThrow(
        new BadRequestException('Email or password is incorrect'),
      );
    });
  });

  describe('refresh', () => {
    it('returns new auth payload for valid refresh token', async () => {
      const farmer = makeFarmer();
      const record = {
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        farmer,
      };
      refreshTokenRepo.findOne.mockResolvedValue(record);
      refreshTokenRepo.delete.mockResolvedValue({});
      refreshTokenRepo.create.mockReturnValue({
        id: 'rt-2',
        token: 'new_hashed',
        expiresAt: new Date(),
      });
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.refresh('raw_refresh_token');

      expect(result).toMatchObject({
        farmer,
        accessToken: 'signed_access_token',
      });
      expect(refreshTokenRepo.delete).toHaveBeenCalledWith('rt-1');
    });

    it('throws UnauthorizedException when token is not found', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh('invalid_token')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('throws UnauthorizedException when token is expired', async () => {
      refreshTokenRepo.findOne.mockResolvedValue({
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(Date.now() - 1000),
        farmer: makeFarmer(),
      });

      await expect(service.refresh('expired_token')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });
  });

  describe('logout', () => {
    it('deletes the refresh token and returns success message', async () => {
      refreshTokenRepo.delete.mockResolvedValue({});

      const result = await service.logout('raw_refresh_token');

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(refreshTokenRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ token: expect.any(String) }),
      );
    });
  });

  describe('changePassword', () => {
    const input = { currentPassword: 'oldPass123', newPassword: 'newPass456' };

    it('updates password hash when current password is correct', async () => {
      const farmer = makeFarmer({ passwordHash: 'hashed_old' } as any);
      farmerRepo.createQueryBuilder.mockReturnValue(makeQBChain(farmer));
      farmerRepo.save.mockResolvedValue(farmer);

      const result = await service.changePassword(farmer.id, input);

      expect(result).toEqual({ message: 'Password updated successfully' });
      expect(farmerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed_password' }),
      );
    });

    it('throws NotFoundException when farmer is not found', async () => {
      farmerRepo.createQueryBuilder.mockReturnValue(makeQBChain(null));

      await expect(
        service.changePassword('nonexistent-id', input),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for OAuth-only account with no password', async () => {
      const farmer = makeFarmer({ passwordHash: undefined } as any);
      farmerRepo.createQueryBuilder.mockReturnValue(makeQBChain(farmer));

      await expect(
        service.changePassword(farmer.id, input),
      ).rejects.toThrow(
        new BadRequestException(
          'Your account uses social login — set a password via account settings first',
        ),
      );
    });

    it('throws BadRequestException when current password is wrong', async () => {
      const farmer = makeFarmer({ passwordHash: 'hashed_old' } as any);
      farmerRepo.createQueryBuilder.mockReturnValue(makeQBChain(farmer));
      jest.spyOn(HashHelper, 'compare').mockResolvedValue(false as never);

      await expect(
        service.changePassword(farmer.id, input),
      ).rejects.toThrow(
        new BadRequestException('Current password is incorrect'),
      );
      expect(farmerRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('handleGoogleLogin', () => {
    const googleUser = {
      email: 'google@example.com',
      firstName: 'Google',
      lastName: 'User',
      googleId: 'google-id-123',
    };

    it('creates a new farmer when none exists', async () => {
      const newFarmer = makeFarmer({
        email: googleUser.email,
        googleId: googleUser.googleId,
      });
      farmerRepo.findOne.mockResolvedValue(null);
      farmerRepo.create.mockReturnValue(newFarmer);
      farmerRepo.save.mockResolvedValue(newFarmer);
      refreshTokenRepo.create.mockReturnValue({
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(),
      });
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.handleGoogleLogin(googleUser);

      expect(farmerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: googleUser.email,
          googleId: googleUser.googleId,
        }),
      );
      expect(result).toMatchObject({ accessToken: 'signed_access_token' });
    });

    it('links googleId to an existing farmer that does not have one', async () => {
      const existingFarmer = makeFarmer({
        email: googleUser.email,
        googleId: undefined,
      });
      farmerRepo.findOne.mockResolvedValue(existingFarmer);
      farmerRepo.save.mockResolvedValue({
        ...existingFarmer,
        googleId: googleUser.googleId,
      });
      refreshTokenRepo.create.mockReturnValue({
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(),
      });
      refreshTokenRepo.save.mockResolvedValue({});

      await service.handleGoogleLogin(googleUser);

      expect(existingFarmer.googleId).toBe(googleUser.googleId);
      expect(farmerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ googleId: googleUser.googleId }),
      );
    });

    it('returns existing farmer without re-linking when googleId already set', async () => {
      const existingFarmer = makeFarmer({
        email: googleUser.email,
        googleId: googleUser.googleId,
      });
      farmerRepo.findOne.mockResolvedValue(existingFarmer);
      farmerRepo.save.mockResolvedValue(existingFarmer);
      refreshTokenRepo.create.mockReturnValue({
        id: 'rt-1',
        token: 'hashed',
        expiresAt: new Date(),
      });
      refreshTokenRepo.save.mockResolvedValue({});

      await service.handleGoogleLogin(googleUser);

      // farmerRepo.save called only for the refresh token path (issueTokens),
      // not for updating the farmer's googleId
      expect(farmerRepo.save).not.toHaveBeenCalled();
    });
  });
});
