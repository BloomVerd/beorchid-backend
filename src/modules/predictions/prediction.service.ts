import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Prediction } from './entities/prediction.entity';
import { PredictionRange } from './entities/prediction-range.entity';
import { Farm } from '../farm/entities/farm.entity';
import { Farmer } from '../farmer/entities/farmer.entity';
import { PredictionProducer } from './prediction.producer';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { throwSubscriptionLimitError } from 'src/common/exceptions/subscription.exceptions';
import { GenerateFarmPredictionResponse } from './types/generate-farm-prediction-response';
import { PaginatedPredictions } from './types/paginated-predictions';

@Injectable()
export class PredictionService {
  constructor(
    @InjectRepository(Prediction)
    private predictionRepository: Repository<Prediction>,
    private readonly predictionProducer: PredictionProducer,
    private readonly farmerSettingsService: FarmerSettingsService,
  ) {}

  async generateFarmPredictions(
    email: string,
    farmId: string,
  ): Promise<GenerateFarmPredictionResponse> {
    return this.predictionRepository.manager.transaction(async (em) => {
      const farmer = await em.findOne(Farmer, { where: { email } });
      if (!farmer) throw new BadRequestException('Farmer not found');

      const farm = await em.findOne(Farm, {
        where: { id: farmId },
        relations: ['farm_images'],
      });
      if (!farm) throw new NotFoundException('Farm not found');

      if (!farm.farm_images?.length) {
        throw new BadRequestException(
          'Farm must have at least 1 image to generate predictions',
        );
      }

      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + diffToMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const range = await em.findOne(PredictionRange, {
        where: {
          farm: { id: farmId },
          inserted_at: Between(weekStart, weekEnd),
        },
      });

      const settings = await this.farmerSettingsService.getOrCreate(farmer.id);

      if (range) {
        if (range.regeneration_count >= settings.predictionWeeklyLimit) {
          throwSubscriptionLimitError(
            `You have exhausted your ${settings.predictionWeeklyLimit} predictions for this week`,
            'predictionWeeklyLimit',
          );
        }
        range.regeneration_count += 1;
        await em.save(range);
      } else {
        await em.save(
          em.create(PredictionRange, {
            week_start: weekStart,
            week_end: weekEnd,
            farm,
            regeneration_count: 1,
          }),
        );
      }

      await this.predictionProducer.createPrediction({ farmId });

      return {
        message: 'Prediction initiated — you will be notified when it is ready',
      };
    });
  }

  async listFarmPredictions(
    farmerId: string,
    farmId: string,
    page: number,
    limit: number,
    year?: number,
    month?: number,
    week?: number,
  ): Promise<PaginatedPredictions> {
    const farm = await this.predictionRepository.manager.findOne(Farm, {
      where: { id: farmId, farmer: { id: farmerId } },
    });
    if (!farm) throw new BadRequestException('Farm not found');

    const where: FindOptionsWhere<Prediction> = { farm: { id: farmId } };

    if (year !== undefined && month !== undefined && week !== undefined) {
      const dayStart = (week - 1) * 7 + 1;
      const weekStart = new Date(year, month - 1, dayStart, 0, 0, 0, 0);
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const dayEnd = week >= 4 ? lastDayOfMonth : week * 7;
      const weekEnd = new Date(year, month - 1, dayEnd, 23, 59, 59, 999);
      where.createdAt = Between(weekStart, weekEnd) as any;
    }

    const [data, total] = await this.predictionRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) || 1 };
  }
}
