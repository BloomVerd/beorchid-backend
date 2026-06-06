import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmHealth } from './entities/farm-health.entity';
import { AlertSeverity } from './entities/health.enums';
import {
  FarmHealthDetail,
  FarmHealthSummary,
  PaginatedFarmHealthSummaries,
} from './types/health.types';
import { WeatherService } from './weather.service';
import { Prediction } from '../predictions/entities/prediction.entity';

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
    @InjectRepository(Prediction)
    private readonly predictionRepository: Repository<Prediction>,
    private readonly weatherService: WeatherService,
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
      .andWhere('fh."farmId" IN (:...farmIds)', { farmIds })
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

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [, allPredictions] = await Promise.all([
      Promise.all(
        data.map(async (summary) => {
          const fh = recordMap.get(summary.farmId);
          if (fh?.farm.lat != null && fh?.farm.lon != null) {
            summary.weather = await this.weatherService.getForecast(
              fh.farm.lat,
              fh.farm.lon,
            );
          }
        }),
      ),
      this.predictionRepository
        .createQueryBuilder('p')
        .innerJoin('p.farm', 'farm')
        .addSelect('farm.id')
        .leftJoinAndSelect('p.image', 'image')
        .where('farm.id IN (:...farmIds)', { farmIds })
        .andWhere('p.createdAt >= :weekAgo', { weekAgo })
        .orderBy('p.createdAt', 'DESC')
        .getMany(),
    ]);

    const predictionsByFarm = new Map<string, Prediction[]>();
    for (const p of allPredictions) {
      const fid = p.farm.id;
      if (!predictionsByFarm.has(fid)) predictionsByFarm.set(fid, []);
      predictionsByFarm.get(fid)!.push(p);
    }

    for (const summary of data) {
      const preds = predictionsByFarm.get(summary.farmId);
      if (preds?.length) {
        summary.predictions = preds.map((p) => ({
          id: p.id,
          predictionType: p.prediction_type,
          riskLevel: p.risk_level,
          lat: p.lat,
          lon: p.lon,
          imageUrl: p.image?.url ?? undefined,
          createdAt: p.createdAt,
        }));
      }
    }

    return { data, total, page, lastPage: Math.ceil(total / limit) || 1 };
  }

  /**
   * Returns the latest FarmHealth snapshot for a specific farm, including
   * all nested health data (crop fields, disease alerts, health alerts,
   * sensor history, yield comparisons).
   */
  async getFarmHealth(farmerId: string, farmId: string): Promise<FarmHealthDetail> {
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

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [weather, rawPredictions] = await Promise.all([
      farmHealth.farm.lat != null && farmHealth.farm.lon != null
        ? this.weatherService.getForecast(farmHealth.farm.lat, farmHealth.farm.lon)
        : Promise.resolve(undefined),
      this.predictionRepository
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.image', 'image')
        .where('p."farmId" = :farmId', { farmId })
        .andWhere('p.createdAt >= :weekAgo', { weekAgo })
        .orderBy('p.createdAt', 'DESC')
        .getMany(),
    ]);

    const predictions = rawPredictions.length
      ? rawPredictions.map((p) => ({
          id: p.id,
          predictionType: p.prediction_type,
          riskLevel: p.risk_level,
          lat: p.lat,
          lon: p.lon,
          imageUrl: p.image?.url ?? undefined,
          createdAt: p.createdAt,
        }))
      : undefined;

    return { health: farmHealth, weather, predictions };
  }
}
