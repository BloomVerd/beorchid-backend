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
    const countRow = await this.farmHealthRepository
      .createQueryBuilder('fh')
      .select('COUNT(DISTINCT fh."farmId")', 'count')
      .innerJoin('fh.farm', 'farm')
      .innerJoin('farm.farmer', 'farmer')
      .where('farmer.id = :farmerId', { farmerId })
      .getRawOne<{ count: string }>();
    const total = parseInt(countRow?.count ?? '0', 10);

    const farmIdRows = await this.farmHealthRepository
      .createQueryBuilder('fh')
      .select('fh."farmId"', 'farmId')
      .innerJoin('fh.farm', 'farm')
      .innerJoin('farm.farmer', 'farmer')
      .where('farmer.id = :farmerId', { farmerId })
      .groupBy('fh."farmId"')
      .orderBy('MAX(fh.computed_at)', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ farmId: string }>();
    const farmIds = farmIdRows.map((r) => r.farmId);

    if (!farmIds.length) {
      return { data: [], total, page, lastPage: Math.ceil(total / limit) || 1 };
    }

    const records = await this.farmHealthRepository
      .createQueryBuilder('fh')
      .innerJoinAndSelect('fh.farm', 'farm')
      .leftJoinAndSelect('fh.health_alerts', 'alerts')
      .where((qb) => {
        const sub = qb
          .subQuery()
          .select('MAX(sub.computed_at)')
          .from(FarmHealth, 'sub')
          .where('sub."farmId" = fh."farmId"')
          .getQuery();
        return `fh.computed_at = (${sub})`;
      })
      .andWhere('fh.farm_id IN (:...farmIds)', { farmIds })
      .getMany();

    const recordMap = new Map(records.map((r) => [r.farm.id, r]));
    const data: FarmHealthSummary[] = farmIds.flatMap((id) => {
      const fh = recordMap.get(id);
      if (!fh) return [];
      const topAlert =
        fh.health_alerts?.length > 0
          ? fh.health_alerts.reduce((best, alert) =>
              SEVERITY_ORDER[alert.severity] > SEVERITY_ORDER[best.severity]
                ? alert
                : best,
            )
          : undefined;
      return [
        {
          farmId: fh.farm.id,
          farmName: fh.farm.name,
          cropType: fh.farm.crop_type,
          area: fh.farm.farm_size,
          healthScore: fh,
          topAlert,
        },
      ];
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) || 1 };
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
