import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  FieldObservation,
  ObservationConfidence,
  ObservationStatus,
} from './entities/field-observation.entity';
import { FieldAgentCapability } from './entities/field-agent-capability.entity';
import { SubmitObservationInput } from './inputs/submit-observation.input';
import { MarketService } from '../market/market.service';
import { PriceType } from '../market/entities/market-price-point.entity';
import { ObservationBatchResult } from './types/batch-result.type';
import { InjectRepository as Inject } from '@nestjs/typeorm';
import { Farmer } from '../farmer/entities/farmer.entity';

@Injectable()
export class FieldService {
  constructor(
    @InjectRepository(FieldObservation)
    private readonly obsRepo: Repository<FieldObservation>,
    @InjectRepository(FieldAgentCapability)
    private readonly capRepo: Repository<FieldAgentCapability>,
    @InjectRepository(Farmer)
    private readonly farmerRepo: Repository<Farmer>,
    private readonly marketService: MarketService,
    @InjectQueue('coin-price-recompute')
    private readonly coinQueue: Queue,
  ) {}

  async submit(input: SubmitObservationInput, agentId: string): Promise<FieldObservation> {
    const obs = this.obsRepo.create({
      ...input,
      observedAt: new Date(input.observedAt),
      agentId,
      attachmentUrls: input.attachmentUrls ?? [],
      conditionTags: input.conditionTags ?? [],
      status: ObservationStatus.SUBMITTED,
    });

    const saved = await this.obsRepo.save(obs);

    if (input.confidence === ObservationConfidence.HIGH) {
      await this.autoApprove(saved, agentId);
    }

    return saved;
  }

  async submitBatch(inputs: SubmitObservationInput[], agentId: string): Promise<ObservationBatchResult> {
    const results = [];
    let accepted = 0, skipped = 0, failed = 0;

    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      try {
        // Idempotency check
        const existing = await this.obsRepo.findOne({
          where: {
            agentId,
            cropId: inp.cropId,
            region: inp.region,
            observedAt: new Date(inp.observedAt),
            priceType: inp.priceType,
          },
        });
        if (existing) {
          results.push({ index: i, success: true, observationId: existing.id, skipped: true });
          skipped++;
          continue;
        }
        const obs = await this.submit(inp, agentId);
        results.push({ index: i, success: true, observationId: obs.id, skipped: false });
        accepted++;
      } catch (e: any) {
        results.push({ index: i, success: false, error: e.message, skipped: false });
        failed++;
      }
    }

    return { results, accepted, skipped, failed };
  }

  private async autoApprove(obs: FieldObservation, reviewedBy: string): Promise<void> {
    const pricePoint = await this.marketService.createPricePoint({
      cropId: obs.cropId,
      region: obs.region,
      price: obs.observedPrice,
      currency: 'GHS',
      observedAt: obs.observedAt,
      source: `field_agent:${obs.agentId}`,
      priceType: obs.priceType as unknown as PriceType,
      qualityGrade: obs.qualityGrade ?? undefined,
      fieldObservationId: obs.id,
      isSuperseded: false,
    });

    obs.status = ObservationStatus.APPROVED;
    obs.reviewedBy = reviewedBy;
    obs.reviewedAt = new Date();
    obs.marketPricePointId = pricePoint.id;
    await this.obsRepo.save(obs);

    await this.coinQueue.add('recompute', { cropId: obs.cropId }, { jobId: `recompute-${obs.cropId}-${Date.now()}` });
  }

  async approve(id: string, reviewerId: string, adjustedPrice?: number): Promise<FieldObservation> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) throw new NotFoundException(`Observation ${id} not found`);
    if (obs.status === ObservationStatus.APPROVED) throw new BadRequestException('Already approved');

    if (adjustedPrice !== undefined) obs.observedPrice = adjustedPrice;
    await this.autoApprove(obs, reviewerId);
    return obs;
  }

  async reject(id: string, reviewerId: string, reason: string): Promise<FieldObservation> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) throw new NotFoundException(`Observation ${id} not found`);
    if (obs.status === ObservationStatus.APPROVED || obs.status === ObservationStatus.REJECTED) {
      throw new BadRequestException('Observation already finalised');
    }

    obs.status = ObservationStatus.REJECTED;
    obs.reviewedBy = reviewerId;
    obs.reviewedAt = new Date();
    obs.reviewNote = reason;
    return this.obsRepo.save(obs);
  }

  async update(id: string, agentId: string, input: Partial<SubmitObservationInput>): Promise<FieldObservation> {
    const obs = await this.obsRepo.findOne({ where: { id, agentId } });
    if (!obs) throw new NotFoundException('Observation not found or not yours');
    if (obs.status !== ObservationStatus.SUBMITTED) {
      throw new ForbiddenException('Can only edit observations in submitted status');
    }
    Object.assign(obs, input);
    return this.obsRepo.save(obs);
  }

  async remove(id: string, agentId: string): Promise<boolean> {
    const obs = await this.obsRepo.findOne({ where: { id, agentId } });
    if (!obs) throw new NotFoundException('Observation not found or not yours');
    if (obs.status !== ObservationStatus.SUBMITTED) {
      throw new ForbiddenException('Can only delete observations in submitted status');
    }
    await this.obsRepo.remove(obs);
    return true;
  }

  myObservations(agentId: string): Promise<FieldObservation[]> {
    return this.obsRepo.find({ where: { agentId }, order: { createdAt: 'DESC' } });
  }

  findById(id: string): Promise<FieldObservation | null> {
    return this.obsRepo.findOne({ where: { id } });
  }

  adminListObservations(filters: {
    status?: ObservationStatus;
    cropId?: string;
    region?: string;
    from?: Date;
    to?: Date;
  }): Promise<FieldObservation[]> {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.cropId) where.cropId = filters.cropId;
    if (filters.region) where.region = filters.region;
    return this.obsRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async grantFieldAgent(userId: string, grantedBy: string): Promise<FieldAgentCapability> {
    const existing = await this.capRepo.findOne({ where: { userId, revokedAt: IsNull() } });
    if (existing) return existing;

    const cap = await this.capRepo.save(this.capRepo.create({ userId, grantedBy }));

    await this.farmerRepo.update(userId, { isFieldAgent: true });
    return cap;
  }

  async revokeFieldAgent(userId: string): Promise<boolean> {
    const cap = await this.capRepo.findOne({ where: { userId, revokedAt: IsNull() } });
    if (!cap) throw new NotFoundException('No active field agent capability for this user');
    cap.revokedAt = new Date();
    await this.capRepo.save(cap);
    await this.farmerRepo.update(userId, { isFieldAgent: false });
    return true;
  }

  listFieldAgents(): Promise<FieldAgentCapability[]> {
    return this.capRepo.find({ where: { revokedAt: IsNull() }, order: { grantedAt: 'DESC' } });
  }
}
