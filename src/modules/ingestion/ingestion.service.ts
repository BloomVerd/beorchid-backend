import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataIngestionJob, IngestionJobStatus, IngestionJobType } from './entities/data-ingestion-job.entity';
import { ExternalFeed } from './entities/external-feed.entity';
import { InjectPricePointInput } from './inputs/inject-price-point.input';
import { CreateExternalFeedInput } from './inputs/create-external-feed.input';
import { MarketService } from '../market/market.service';
import { MarketPricePoint, PriceType } from '../market/entities/market-price-point.entity';

@Injectable()
export class IngestionService {
  constructor(
    @InjectRepository(DataIngestionJob)
    private readonly jobRepo: Repository<DataIngestionJob>,
    @InjectRepository(ExternalFeed)
    private readonly feedRepo: Repository<ExternalFeed>,
    private readonly marketService: MarketService,
    @InjectQueue('ingestion')
    private readonly ingestionQueue: Queue,
    @InjectQueue('coin-price-recompute')
    private readonly coinQueue: Queue,
  ) {}

  async injectPricePoint(input: InjectPricePointInput, submittedBy: string) {
    let cropId = input.cropId;
    if (!cropId && input.cropSlug) {
      const crop = await this.marketService.findCropBySlug(input.cropSlug);
      if (!crop) throw new NotFoundException(`Crop slug '${input.cropSlug}' not found`);
      cropId = crop.id;
    }
    if (!cropId) throw new NotFoundException('cropId or cropSlug required');

    const point = await this.marketService.createPricePoint({
      cropId,
      region: input.region,
      price: input.priceInPesewas,
      currency: input.currency ?? 'GHS',
      observedAt: new Date(input.observedAt),
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      priceType: input.priceType,
      volumeKg: input.volumeKg ?? null,
      qualityGrade: input.qualityGrade ?? null,
      notes: input.notes ?? null,
      isSuperseded: false,
    });

    await this.coinQueue.add('recompute', { cropId }, { jobId: `recompute-${cropId}-${Date.now()}` });
    return point;
  }

  async correctPricePoint(id: string, newPriceInPesewas: number, actorId: string): Promise<MarketPricePoint> {
    const repo = this.jobRepo.manager.getRepository(MarketPricePoint);

    const old = await repo.findOne({ where: { id } });
    if (!old) throw new NotFoundException('Price point not found');

    const newPoint = await repo.save(repo.create({
      cropId: old.cropId,
      region: old.region,
      price: newPriceInPesewas,
      currency: old.currency,
      observedAt: old.observedAt,
      source: old.source,
      priceType: old.priceType,
      isSuperseded: false,
    }));

    old.isSuperseded = true;
    old.supersededBy = newPoint.id;
    await repo.save(old);

    await this.coinQueue.add('recompute', { cropId: old.cropId }, { jobId: `recompute-${old.cropId}-${Date.now()}` });
    return newPoint;
  }

  async createJob(
    type: IngestionJobType,
    submittedBy: string,
    storageRef?: string,
    feedId?: string,
  ): Promise<DataIngestionJob> {
    const job = await this.jobRepo.save(
      this.jobRepo.create({ type, submittedBy, storageRef: storageRef ?? null, feedId: feedId ?? null }),
    );
    await this.ingestionQueue.add('process', { jobId: job.id, type }, { jobId: `ingest-${job.id}` });
    return job;
  }

  listJobs(submittedBy?: string): Promise<DataIngestionJob[]> {
    const where = submittedBy ? { submittedBy } : {};
    return this.jobRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findJobById(id: string): Promise<DataIngestionJob> {
    const job = await this.jobRepo.find({ where: { id } });
    if (!job.length) throw new NotFoundException(`Job ${id} not found`);
    return job[0];
  }

  async createFeed(input: CreateExternalFeedInput, createdBy: string): Promise<ExternalFeed> {
    return this.feedRepo.save(this.feedRepo.create({ ...input, createdBy, isActive: true }));
  }

  listFeeds(): Promise<ExternalFeed[]> {
    return this.feedRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findFeedById(id: string): Promise<ExternalFeed> {
    const feed = await this.feedRepo.findOne({ where: { id } });
    if (!feed) throw new NotFoundException(`Feed ${id} not found`);
    return feed;
  }

  async updateFeed(id: string, data: Partial<ExternalFeed>): Promise<ExternalFeed> {
    await this.feedRepo.update(id, data);
    return this.findFeedById(id);
  }

  async deleteFeed(id: string): Promise<boolean> {
    await this.feedRepo.delete(id);
    return true;
  }

  async triggerFeedNow(id: string, submittedBy: string): Promise<DataIngestionJob> {
    const feed = await this.findFeedById(id);
    return this.createJob(IngestionJobType.EXTERNAL_FEED_RUN, submittedBy, undefined, feed.id);
  }

  async updateJobProgress(
    id: string,
    update: Partial<Pick<DataIngestionJob, 'status' | 'processedCount' | 'skippedCount' | 'errorCount' | 'errors' | 'startedAt' | 'completedAt' | 'rowCount'>>,
  ): Promise<void> {
    await this.jobRepo.update(id, update);
  }
}
