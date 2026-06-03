import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Farm } from '../farm/entities/farm.entity';
import { FarmHealth } from './entities/farm-health.entity';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { HealthProducer } from './health.producer';

const BATCH_SIZE = 50;

@Injectable()
export class HealthScheduler {
  private readonly logger = new Logger(HealthScheduler.name);

  constructor(
    @InjectRepository(Farm) private readonly farmRepo: Repository<Farm>,
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepo: Repository<FarmHealth>,
    private readonly farmerSettingsService: FarmerSettingsService,
    private readonly healthProducer: HealthProducer,
  ) {}

  @Cron('0 */15 * * * *')
  async schedulePendingHealthComputes(): Promise<void> {
    const farms = await this.farmRepo.find({
      where: { farmer: { isActive: true } },
      relations: ['farmer'],
    });

    if (!farms.length) return;

    const latestHealth = await this.farmHealthRepo
      .createQueryBuilder('fh')
      .select('fh.farmId', 'farmId')
      .addSelect('MAX(fh.computed_at)', 'lastComputedAt')
      .groupBy('fh.farmId')
      .getRawMany<{ farmId: string; lastComputedAt: string | null }>();

    const healthMap = new Map(
      latestHealth.map((r) => [r.farmId, r.lastComputedAt]),
    );

    const staleFarmIds: string[] = [];

    for (const farm of farms) {
      const settings = await this.farmerSettingsService.getOrCreate(
        farm.farmer.id,
      );
      const intervalMs = settings.healthReportIntervalSeconds * 1000;
      const lastComputed = healthMap.get(farm.id);
      const isStale =
        !lastComputed ||
        Date.now() - new Date(lastComputed).getTime() >= intervalMs;
      if (isStale) staleFarmIds.push(farm.id);
    }

    if (!staleFarmIds.length) return;

    for (let i = 0; i < staleFarmIds.length; i += BATCH_SIZE) {
      await this.healthProducer.enqueueBatch(
        staleFarmIds.slice(i, i + BATCH_SIZE),
      );
    }

    this.logger.log(
      `Enqueued health computation for ${staleFarmIds.length} farm(s)`,
    );
  }
}
