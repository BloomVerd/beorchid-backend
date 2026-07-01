import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Farmer } from './entities/farmer.entity';
import { AdminCreateUserInput } from './inputs/admin-create-user.input';
import { HashHelper } from 'src/common/lib';

/**
 * Core CRUD service for the `Farmer` entity.
 *
 * Note: `passwordHash` is excluded from the default TypeORM select (`select: false`
 * on the column). Use `findByEmailWithPassword()` when you need the hash (login flows).
 */
@Injectable()
export class FarmerService {
  constructor(
    @InjectRepository(Farmer)
    private farmerRepository: Repository<Farmer>,
  ) {}

  // ── Lookups ──────────────────────────────────────────────────────────────

  /**
   * Returns a farmer by ID.
   * @throws `NotFoundException` if not found.
   */
  async findById(id: string): Promise<Farmer> {
    const farmer = await this.farmerRepository.findOne({ where: { id } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return farmer;
  }

  /** Returns a farmer by email, or `null` if not found. Does not include `passwordHash`. */
  async findByEmail(email: string): Promise<Farmer | null> {
    return this.farmerRepository.findOne({ where: { email } });
  }

  /** Returns a farmer with `passwordHash` explicitly selected. Used only in password-login flows. */
  async findByEmailWithPassword(email: string): Promise<Farmer | null> {
    return this.farmerRepository
      .createQueryBuilder('farmer')
      .addSelect('farmer.passwordHash')
      .where('farmer.email = :email', { email })
      .getOne();
  }

  // ── Admin operations ─────────────────────────────────────────────────────

  /**
   * Creates a farmer account from the admin panel. Hashes the password before
   * saving and defaults the role to `['farmer']` if none is supplied.
   * @throws `ConflictException` if the email is already registered.
   */
  async adminCreateUser(input: AdminCreateUserInput): Promise<Farmer> {
    const existing = await this.farmerRepository.findOne({ where: { email: input.email } });
    if (existing) throw new ConflictException('An account with this email already exists');
    const farmer = this.farmerRepository.create({
      firstName: input.firstName,
      lastName:  input.lastName,
      email:     input.email,
      country:   input.country || 'GH',
      passwordHash: await HashHelper.encrypt(input.password),
      roles: input.roles?.length ? input.roles : ['farmer'],
    });
    return this.farmerRepository.save(farmer);
  }

  /** Returns all farmers ordered by creation date, newest first. Used by the admin module. */
  async findAll(): Promise<Farmer[]> {
    return this.farmerRepository.find({ order: { createdAt: 'DESC' } });
  }
}
