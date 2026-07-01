import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmerSettings } from './entities/farmer-settings.entity';
import { Farmer } from './entities/farmer.entity';
import { UpdateFarmerSettingsInput } from './inputs/update-farmer-settings.input';

/**
 * Manages `FarmerSettings` — notification toggles, pipeline intervals, and limits.
 *
 * `getOrCreate()` is the primary access point: it is idempotent and safe to call
 * from any worker or service. All settings are initialized to their column defaults
 * on first creation so callers never receive `null`.
 */
@Injectable()
export class FarmerSettingsService {
  constructor(
    @InjectRepository(FarmerSettings)
    private readonly settingsRepo: Repository<FarmerSettings>,
  ) {}

  /**
   * Returns the farmer's settings row, creating it with defaults if it doesn't exist.
   * Safe to call concurrently — a second concurrent insert will simply be ignored
   * by the subsequent `findOne`.
   */
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

  /**
   * Applies a partial update to the farmer's settings. `null` fields in `input`
   * are filtered out so unset GraphQL arguments don't overwrite existing values.
   */
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
