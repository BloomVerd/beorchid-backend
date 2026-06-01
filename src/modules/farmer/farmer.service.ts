import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Farmer } from './entities/farmer.entity';

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
}
