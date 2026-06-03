import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmerSettings } from './entities/farmer-settings.entity';
import { Farmer } from './entities/farmer.entity';
import { UpdateFarmerSettingsInput } from './inputs/update-farmer-settings.input';

@Injectable()
export class FarmerSettingsService {
  constructor(
    @InjectRepository(FarmerSettings)
    private readonly settingsRepo: Repository<FarmerSettings>,
  ) {}

  async getOrCreate(farmerId: string): Promise<FarmerSettings> {
    let settings = await this.settingsRepo.findOne({
      where: { farmer: { id: farmerId } },
    });
    if (!settings) {
      settings = this.settingsRepo.create({
        farmer: { id: farmerId } as Farmer,
      });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async update(
    farmerId: string,
    input: UpdateFarmerSettingsInput,
  ): Promise<FarmerSettings> {
    const settings = await this.getOrCreate(farmerId);
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v != null),
    );
    Object.assign(settings, patch);
    return this.settingsRepo.save(settings);
  }
}
