import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmHealth } from './entities/farm-health.entity';
import { AlertSeverity } from './entities/health.enums';
import {
  FarmHealthSummary,
  PaginatedFarmHealthSummaries,
} from './types/health.types';

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  [AlertSeverity.CRITICAL]: 3,
  [AlertSeverity.WARNING]: 2,
  [AlertSeverity.INFO]: 1,
};

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(FarmHealth)
    private readonly farmHealthRepository: Repository<FarmHealth>,
  ) {}

  /**
   * Returns a paginated list of health summaries for all farms belonging to
   * the authenticated farmer. Each summary includes the latest FarmHealth
   * snapshot and the top-priority HealthAlert.
   */
  async listFarmsHealth(
    farmerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedFarmHealthSummaries> {
    const [records, total] = await this.farmHealthRepository.findAndCount({
      where: { farm: { farmer: { id: farmerId } } },
      relations: ['farm', 'health_alerts'],
      order: { computed_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data: FarmHealthSummary[] = records.map((fh) => {
      const topAlert =
        fh.health_alerts?.length > 0
          ? fh.health_alerts.reduce((best, alert) =>
              SEVERITY_ORDER[alert.severity] > SEVERITY_ORDER[best.severity]
                ? alert
                : best,
            )
          : undefined;

      return {
        farmId: fh.farm.id,
        farmName: fh.farm.name,
        cropType: fh.farm.crop_type,
        area: fh.farm.farm_size,
        healthScore: fh,
        topAlert,
      };
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) };
  }

  /**
   * Returns the latest FarmHealth snapshot for a specific farm, including
   * all nested health data (crop fields, disease alerts, health alerts,
   * sensor history, yield comparisons).
   */
  async getFarmHealth(farmerId: string, farmId: string): Promise<FarmHealth> {
    const farmHealth = await this.farmHealthRepository.findOne({
      where: { farm: { id: farmId, farmer: { id: farmerId } } },
      relations: [
        'farm',
        'crop_field_health',
        'disease_alerts',
        'health_alerts',
        'sensor_history',
        'yield_comparisons',
      ],
      order: { computed_at: 'DESC' },
    });

    if (!farmHealth) {
      throw new NotFoundException(
        `No health data found for farm ${farmId}. Health is computed asynchronously — please ensure predictions have been generated.`,
      );
    }

    return farmHealth;
  }
}
