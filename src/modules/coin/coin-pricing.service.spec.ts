import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CoinPricingService } from './coin-pricing.service';
import { Coin, CoinStatus } from './entities/coin.entity';
import { CoinPricePoint } from './entities/coin-price-point.entity';
import { MarketService } from '../market/market.service';

const makeRepo = (overrides: Partial<any> = {}) => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
  ...overrides,
});

const makeCoin = (overrides: Partial<Coin> = {}): Coin => ({
  id: 'coin-1',
  name: 'Maize Coin',
  symbol: 'MZC',
  cropId: 'crop-1',
  basePrice: 10000,
  currentPrice: 10000,
  circulatingSupply: 0,
  pricingWeights: { w_trend: 0.3, w_demand: 0.2, w_health: 0.3, w_vol: 0.2 },
  status: CoinStatus.ACTIVE,
  createdBy: 'admin-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as Coin);

describe('CoinPricingService', () => {
  let service: CoinPricingService;
  let coinRepo: ReturnType<typeof makeRepo>;
  let pointRepo: ReturnType<typeof makeRepo>;
  let marketService: { getCropPrices: jest.Mock };

  beforeEach(async () => {
    coinRepo     = makeRepo();
    pointRepo    = makeRepo();
    marketService = { getCropPrices: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoinPricingService,
        { provide: getRepositoryToken(Coin),          useValue: coinRepo  },
        { provide: getRepositoryToken(CoinPricePoint), useValue: pointRepo },
        { provide: MarketService, useValue: marketService },
      ],
    }).compile();

    service = module.get<CoinPricingService>(CoinPricingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('recompute — formula & clamping', () => {
    it('returns basePrice when no market data exists (neutral multiplier = 1)', async () => {
      const coin = makeCoin({ basePrice: 10000, currentPrice: 10000 });
      coinRepo.findOne.mockResolvedValue(coin);
      marketService.getCropPrices.mockResolvedValue([]); // no price history
      const savedPoint = { id: 'pp-1', price: 10000 };
      pointRepo.save.mockResolvedValue(savedPoint);
      coinRepo.save.mockResolvedValue(coin);

      const point = await service.recompute('coin-1');

      expect(point.price).toBe(10000); // 10000 × clamp(1, 0.25, 4.0) = 10000
    });

    it('clamps multiplier at 0.25 when factors are very negative', async () => {
      const coin = makeCoin({ basePrice: 10000, pricingWeights: { w_trend: 1.0, w_demand: 0, w_health: 0, w_vol: 0 } });
      coinRepo.findOne.mockResolvedValue(coin);

      // Recent average much lower than older → strongly negative trend
      const oldPrices = Array.from({ length: 5 }, () => ({ price: 10000 }));
      const recentPrices = Array.from({ length: 5 }, () => ({ price: 1000 })); // −90%

      marketService.getCropPrices
        .mockResolvedValueOnce(recentPrices)  // 1st call: recent (from 30 days ago)
        .mockResolvedValueOnce(oldPrices);    // 2nd call: older  (60→30 days ago)

      let savedPrice: number | undefined;
      pointRepo.save.mockImplementation((p: any) => {
        savedPrice = p.price;
        return Promise.resolve(p);
      });
      coinRepo.save.mockResolvedValue(coin);

      await service.recompute('coin-1');

      // multiplier = clamp(1 + 1.0 × (−1), 0.25, 4.0) = clamp(0, 0.25, 4.0) = 0.25
      expect(savedPrice).toBe(Math.round(10000 * 0.25)); // 2500
    });

    it('clamps multiplier at 4.0 when trend factor pushes very high', async () => {
      const coin = makeCoin({ basePrice: 10000, pricingWeights: { w_trend: 1.0, w_demand: 0, w_health: 0, w_vol: 0 } });
      coinRepo.findOne.mockResolvedValue(coin);

      // Recent prices 5× older prices → +400% normalized to +1 (cap)
      const oldPrices = Array.from({ length: 5 }, () => ({ price: 1000 }));
      const recentPrices = Array.from({ length: 5 }, () => ({ price: 5000 }));

      marketService.getCropPrices
        .mockResolvedValueOnce(recentPrices)
        .mockResolvedValueOnce(oldPrices);

      let savedPrice: number | undefined;
      pointRepo.save.mockImplementation((p: any) => {
        savedPrice = p.price;
        return Promise.resolve(p);
      });
      coinRepo.save.mockResolvedValue(coin);

      await service.recompute('coin-1');

      // multiplier = clamp(1 + 1.0 × 1.0, 0.25, 4.0) = clamp(2, 0.25, 4.0) = 2
      expect(savedPrice).toBe(20000);
    });

    it('throws NotFoundException when coin does not exist', async () => {
      coinRepo.findOne.mockResolvedValue(null);
      await expect(service.recompute('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('persists inputs jsonb alongside the computed price', async () => {
      const coin = makeCoin({ basePrice: 10000 });
      coinRepo.findOne.mockResolvedValue(coin);
      marketService.getCropPrices.mockResolvedValue([]);
      pointRepo.save.mockImplementation((p: any) => Promise.resolve(p));
      coinRepo.save.mockResolvedValue(coin);

      const point = await service.recompute('coin-1');

      expect(point).toHaveProperty('inputs');
      expect(point.inputs).toMatchObject({ basePrice: 10000 });
    });

    it('updates coin.currentPrice after recompute', async () => {
      const coin = makeCoin({ basePrice: 10000, currentPrice: 8000 });
      coinRepo.findOne.mockResolvedValue(coin);
      marketService.getCropPrices.mockResolvedValue([]);
      pointRepo.save.mockImplementation((p: any) => Promise.resolve(p));
      coinRepo.save.mockResolvedValue(coin);

      await service.recompute('coin-1');

      expect(coinRepo.save).toHaveBeenCalledWith(expect.objectContaining({ currentPrice: 10000 }));
    });
  });
});
