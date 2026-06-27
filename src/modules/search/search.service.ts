import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Or, Repository } from 'typeorm';
import { Listing } from '../marketplace/entities/listing.entity';
import { Coin } from '../coin/entities/coin.entity';
import { InvestmentPlan } from '../investment/entities/investment-plan.entity';
import { Crop } from '../market/entities/crop.entity';
import { SearchResults } from './types/search-results.type';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Listing) private readonly listingRepo: Repository<Listing>,
    @InjectRepository(Coin) private readonly coinRepo: Repository<Coin>,
    @InjectRepository(InvestmentPlan) private readonly planRepo: Repository<InvestmentPlan>,
    @InjectRepository(Crop) private readonly cropRepo: Repository<Crop>,
  ) {}

  async search(query: string, limit = 5): Promise<SearchResults> {
    if (query.trim().length < 2) {
      return { listings: [], coins: [], plans: [], crops: [] };
    }

    const q = query.trim();
    const take = Math.min(limit, 20);

    const [listings, coins, plans, crops] = await Promise.all([
      this.listingRepo.find({
        where: [
          { crop: ILike(`%${q}%`) },
          { description: ILike(`%${q}%`) },
          { region: ILike(`%${q}%`) },
        ],
        order: { createdAt: 'DESC' },
        take,
      }),
      this.coinRepo.find({
        where: [
          { name: ILike(`%${q}%`) },
          { symbol: ILike(`%${q}%`) },
        ],
        order: { createdAt: 'DESC' },
        take,
      }),
      this.planRepo.find({
        where: { title: ILike(`%${q}%`) },
        order: { createdAt: 'DESC' },
        take,
      }),
      this.cropRepo.find({
        where: [
          { name: ILike(`%${q}%`) },
          { slug: ILike(`%${q}%`) },
        ],
        order: { createdAt: 'DESC' },
        take,
      }),
    ]);

    return { listings, coins, plans, crops };
  }
}
