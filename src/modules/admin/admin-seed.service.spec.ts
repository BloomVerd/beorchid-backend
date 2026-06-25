import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AdminSeedService } from './admin-seed.service';
import { Farmer } from '../farmer/entities/farmer.entity';
import { EmailProducer } from '../email/email.producer';

jest.mock('src/common/lib', () => ({
  HashHelper: { encrypt: jest.fn().mockResolvedValue('hashed-password') },
}));

describe('AdminSeedService', () => {
  let service: AdminSeedService;
  let farmerRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let emailProducer: { sendSuperAdminCredentials: jest.Mock };
  let configGet: jest.Mock;

  beforeEach(async () => {
    farmerRepo    = { findOne: jest.fn(), save: jest.fn(), create: jest.fn((d) => d) };
    emailProducer = { sendSuperAdminCredentials: jest.fn().mockResolvedValue(undefined) };
    configGet     = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSeedService,
        { provide: getRepositoryToken(Farmer), useValue: farmerRepo },
        { provide: EmailProducer, useValue: emailProducer },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get<AdminSeedService>(AdminSeedService);
  });

  afterEach(() => jest.clearAllMocks());

  it('skips seeding and warns when SUPER_ADMIN_EMAIL is not set', async () => {
    configGet.mockReturnValue(undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    await service.seedSuperAdmin();

    expect(farmerRepo.findOne).not.toHaveBeenCalled();
    expect(emailProducer.sendSuperAdminCredentials).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SUPER_ADMIN_EMAIL not set'));
    warn.mockRestore();
  });

  it('skips seeding when admin account already exists', async () => {
    configGet.mockReturnValue('admin@example.com');
    farmerRepo.findOne.mockResolvedValue({ id: 'existing-admin', email: 'admin@example.com' });

    await service.seedSuperAdmin();

    expect(farmerRepo.save).not.toHaveBeenCalled();
    expect(emailProducer.sendSuperAdminCredentials).not.toHaveBeenCalled();
  });

  it('creates admin account with correct roles and sends credentials email', async () => {
    configGet.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        SUPER_ADMIN_EMAIL:      'admin@example.com',
        SUPER_ADMIN_FIRST_NAME: 'Test',
        SUPER_ADMIN_LAST_NAME:  'Admin',
      };
      return map[key];
    });
    farmerRepo.findOne.mockResolvedValue(null);
    farmerRepo.save.mockResolvedValue({ id: 'new-admin' });

    await service.seedSuperAdmin();

    expect(farmerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@example.com',
        roles: ['super_admin'],
        passwordHash: 'hashed-password',
      }),
    );
    expect(emailProducer.sendSuperAdminCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@example.com', firstName: 'Test' }),
    );
  });

  it('never stores the plaintext password in the saved record', async () => {
    configGet.mockReturnValue('admin@example.com');
    farmerRepo.findOne.mockResolvedValue(null);

    let savedRecord: any;
    farmerRepo.save.mockImplementation((r: any) => {
      savedRecord = r;
      return Promise.resolve(r);
    });

    let emailData: any;
    emailProducer.sendSuperAdminCredentials.mockImplementation((d: any) => {
      emailData = d;
      return Promise.resolve();
    });

    await service.seedSuperAdmin();

    // The plaintext password sent by email must NOT appear in the persisted record
    expect(savedRecord).not.toHaveProperty('password');
    expect(savedRecord.passwordHash).not.toBe(emailData.password);
    expect(savedRecord.passwordHash).toBe('hashed-password');
  });
});
