import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Farmer } from './entities/farmer.entity';
import { AdminCreateUserInput } from './inputs/admin-create-user.input';
import { HashHelper } from 'src/common/lib';

@Injectable()
export class FarmerService {
  constructor(
    @InjectRepository(Farmer)
    private farmerRepository: Repository<Farmer>,
  ) {}

  async findById(id: string): Promise<Farmer> {
    const farmer = await this.farmerRepository.findOne({ where: { id } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return farmer;
  }

  async findByEmail(email: string): Promise<Farmer | null> {
    return this.farmerRepository.findOne({ where: { email } });
  }

  async findByEmailWithPassword(email: string): Promise<Farmer | null> {
    return this.farmerRepository
      .createQueryBuilder('farmer')
      .addSelect('farmer.passwordHash')
      .where('farmer.email = :email', { email })
      .getOne();
  }

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

  async findAll(): Promise<Farmer[]> {
    return this.farmerRepository.find({ order: { createdAt: 'DESC' } });
  }
}
