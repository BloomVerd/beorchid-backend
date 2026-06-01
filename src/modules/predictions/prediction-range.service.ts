import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { PredictionRange } from './entities/prediction-range.entity';
import { Farm } from '../farm/entities/farm.entity';

@Injectable()
export class PredictionRangeService {
  constructor(
    @InjectRepository(PredictionRange)
    private predictionRangeRepository: Repository<PredictionRange>,
  ) {}

  async createPredictionRange(
    farmerId: string,
    farmId: string,
  ): Promise<PredictionRange> {
    return this.predictionRangeRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
      });
      if (!farm) throw new BadRequestException('Farm not found');

      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const existing = await em.findOne(PredictionRange, {
        where: { farm: { id: farmId }, inserted_at: Between(weekStart, weekEnd) },
      });
      if (existing) {
        throw new BadRequestException(
          'A prediction range for this week already exists',
        );
      }

      const range = em.create(PredictionRange, {
        week_start: weekStart,
        week_end: weekEnd,
        farm,
      });

      return em.save(range);
    });
  }
}
