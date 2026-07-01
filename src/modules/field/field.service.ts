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

/**
 * Service for field agent credentialing and price observation management.
 *
 * Observation flow:
 *  - Submitted observations with `confidence === HIGH` are auto-approved
 *    immediately, publishing a market price point and enqueuing a coin reprice.
 *  - All other observations sit in SUBMITTED status until a `super_admin`
 *    manually approves or rejects them.
 *  - Observations can only be edited or deleted while in SUBMITTED status.
 */
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

  /**
   * Submits a single field observation. If `confidence` is HIGH the observation
   * is immediately auto-approved: a market price point is created and a coin
   * reprice job is enqueued. Otherwise the observation awaits manual review.
   */
  async submit(
    input: SubmitObservationInput,
    agentId: string,
  ): Promise<FieldObservation> {
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

  /**
   * Submits up to 50 observations in a single call. Each item is checked for
   * idempotency against `(agentId, cropId, region, observedAt, priceType)` —
   * duplicates are counted as `skipped` rather than errors. Returns per-item
   * results plus aggregate `accepted`, `skipped`, and `failed` counts.
   */
  async submitBatch(
    inputs: SubmitObservationInput[],
    agentId: string,
  ): Promise<ObservationBatchResult> {
    const results = [];
    let accepted = 0,
      skipped = 0,
      failed = 0;

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
          results.push({
            index: i,
            success: true,
            observationId: existing.id,
            skipped: true,
          });
          skipped++;
          continue;
        }
        const obs = await this.submit(inp, agentId);
        results.push({
          index: i,
          success: true,
          observationId: obs.id,
          skipped: false,
        });
        accepted++;
      } catch (e: any) {
        results.push({
          index: i,
          success: false,
          error: e.message,
          skipped: false,
        });
        failed++;
      }
    }

    return { results, accepted, skipped, failed };
  }

  /**
   * Promotes an observation to APPROVED. Creates a `MarketPricePoint` from the
   * observation data (using `adjustedPrice` if provided) and enqueues a
   * `coin-price-recompute` job for the affected crop.
   */
  private async autoApprove(
    obs: FieldObservation,
    reviewedBy: string,
  ): Promise<void> {
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

    await this.coinQueue.add(
      'recompute',
      { cropId: obs.cropId },
      { jobId: `recompute-${obs.cropId}-${Date.now()}` },
    );
  }

  /**
   * Manually approves a submitted observation. Optionally overrides
   * `observedPrice` with `adjustedPrice` before publishing the market price
   * point. Throws 400 if the observation is already approved.
   *
   * @throws NotFoundException   if the observation does not exist
   * @throws BadRequestException if already approved
   */
  async approve(
    id: string,
    reviewerId: string,
    adjustedPrice?: number,
  ): Promise<FieldObservation> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) throw new NotFoundException(`Observation ${id} not found`);
    if (obs.status === ObservationStatus.APPROVED)
      throw new BadRequestException('Already approved');

    if (adjustedPrice !== undefined) obs.observedPrice = adjustedPrice;
    await this.autoApprove(obs, reviewerId);
    return obs;
  }

  /**
   * Rejects a submitted or under-review observation with a reviewer note.
   *
   * @throws NotFoundException   if the observation does not exist
   * @throws BadRequestException if the observation is already finalised
   */
  async reject(
    id: string,
    reviewerId: string,
    reason: string,
  ): Promise<FieldObservation> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) throw new NotFoundException(`Observation ${id} not found`);
    if (
      obs.status === ObservationStatus.APPROVED ||
      obs.status === ObservationStatus.REJECTED
    ) {
      throw new BadRequestException('Observation already finalised');
    }

    obs.status = ObservationStatus.REJECTED;
    obs.reviewedBy = reviewerId;
    obs.reviewedAt = new Date();
    obs.reviewNote = reason;
    return this.obsRepo.save(obs);
  }

  /**
   * Updates a field observation. Only the submitting agent may edit it, and
   * only while it is still in SUBMITTED status.
   *
   * @throws NotFoundException  if the observation does not exist or belongs to another agent
   * @throws ForbiddenException if the observation has already been reviewed
   */
  async update(
    id: string,
    agentId: string,
    input: Partial<SubmitObservationInput>,
  ): Promise<FieldObservation> {
    const obs = await this.obsRepo.findOne({ where: { id, agentId } });
    if (!obs) throw new NotFoundException('Observation not found or not yours');
    if (obs.status !== ObservationStatus.SUBMITTED) {
      throw new ForbiddenException(
        'Can only edit observations in submitted status',
      );
    }
    Object.assign(obs, input);
    return this.obsRepo.save(obs);
  }

  /**
   * Deletes a field observation. Only the submitting agent may delete it, and
   * only while it is still in SUBMITTED status.
   *
   * @throws NotFoundException  if the observation does not exist or belongs to another agent
   * @throws ForbiddenException if the observation has already been reviewed
   */
  async remove(id: string, agentId: string): Promise<boolean> {
    const obs = await this.obsRepo.findOne({ where: { id, agentId } });
    if (!obs) throw new NotFoundException('Observation not found or not yours');
    if (obs.status !== ObservationStatus.SUBMITTED) {
      throw new ForbiddenException(
        'Can only delete observations in submitted status',
      );
    }
    await this.obsRepo.remove(obs);
    return true;
  }

  /** Returns all observations submitted by the given agent, newest first. */
  myObservations(agentId: string): Promise<FieldObservation[]> {
    return this.obsRepo.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Returns a single observation by ID, or null if not found. */
  findById(id: string): Promise<FieldObservation | null> {
    return this.obsRepo.findOne({ where: { id } });
  }

  /** Returns observations matching the given admin filters, newest first. */
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

  /**
   * Grants field agent capability to a user. Idempotent — returns the existing
   * capability if already granted. Sets `farmer.isFieldAgent = true`.
   */
  async grantFieldAgent(
    userId: string,
    grantedBy: string,
  ): Promise<FieldAgentCapability> {
    const existing = await this.capRepo.findOne({
      where: { userId, revokedAt: IsNull() },
    });
    if (existing) return existing;

    const cap = await this.capRepo.save(
      this.capRepo.create({ userId, grantedBy }),
    );

    await this.farmerRepo.update(userId, { isFieldAgent: true });
    return cap;
  }

  /**
   * Revokes field agent capability by setting `revokedAt` on the capability
   * row and flipping `farmer.isFieldAgent` back to false.
   *
   * @throws NotFoundException if the user has no active field agent capability
   */
  async revokeFieldAgent(userId: string): Promise<boolean> {
    const cap = await this.capRepo.findOne({
      where: { userId, revokedAt: IsNull() },
    });
    if (!cap)
      throw new NotFoundException(
        'No active field agent capability for this user',
      );
    cap.revokedAt = new Date();
    await this.capRepo.save(cap);
    await this.farmerRepo.update(userId, { isFieldAgent: false });
    return true;
  }

  /** Returns all currently active field agent capability records. */
  listFieldAgents(): Promise<FieldAgentCapability[]> {
    return this.capRepo.find({
      where: { revokedAt: IsNull() },
      order: { grantedAt: 'DESC' },
    });
  }
}
