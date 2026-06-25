import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Farmer } from '../farmer/entities/farmer.entity';
import { HashHelper } from 'src/common/lib';
import { EmailProducer } from '../email/email.producer';

@Injectable()
export class AdminSeedService {
  constructor(
    @InjectRepository(Farmer) private readonly farmerRepo: Repository<Farmer>,
    private readonly emailProducer: EmailProducer,
    private readonly configService: ConfigService,
  ) {}

  async seedSuperAdmin(): Promise<void> {
    const email = this.configService.get<string>('SUPER_ADMIN_EMAIL');
    if (!email) {
      console.warn('[AdminSeed] SUPER_ADMIN_EMAIL not set — skipping super_admin seed');
      return;
    }

    const existing = await this.farmerRepo.findOne({ where: { email } });
    if (existing) return;

    const firstName = this.configService.get<string>('SUPER_ADMIN_FIRST_NAME') ?? 'Admin';
    const lastName  = this.configService.get<string>('SUPER_ADMIN_LAST_NAME')  ?? 'User';

    const password = crypto.randomBytes(12).toString('base64url');
    const passwordHash = await HashHelper.encrypt(password);

    await this.farmerRepo.save(
      this.farmerRepo.create({
        firstName,
        lastName,
        email,
        country: 'GH',
        roles: ['super_admin'],
        passwordHash,
        isFieldAgent: false,
      }),
    );

    await this.emailProducer.sendSuperAdminCredentials({ email, firstName, password });

    console.log('[AdminSeed] super_admin account created:', email);
  }
}
