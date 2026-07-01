import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FieldService } from './field.service';
import { FieldObservation, ObservationStatus } from './entities/field-observation.entity';
import { FieldAgentCapability } from './entities/field-agent-capability.entity';
import { SubmitObservationInput } from './inputs/submit-observation.input';
import { ObservationBatchResult } from './types/batch-result.type';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles, FieldAgentGuard } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for the field module. All operations require a valid JWT.
 * Observation submission and management require the `FieldAgentGuard`
 * (`farmer.isFieldAgent === true`). Admin review and credentialing operations
 * require the `super_admin` role.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class FieldResolver {
  constructor(private readonly fieldService: FieldService) {}

  /**
   * Submits a single field observation. HIGH-confidence observations are
   * auto-approved and immediately published as a market price point.
   * Requires field agent capability.
   */
  @Mutation(() => FieldObservation)
  @UseGuards(FieldAgentGuard)
  submitFieldObservation(
    @Args('input') input: SubmitObservationInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldObservation> {
    return this.fieldService.submit(input, user.id);
  }

  /**
   * Submits up to 50 observations in one call. Duplicate entries (matched on
   * agentId + cropId + region + observedAt + priceType) are skipped rather than
   * errored. Returns per-item results and aggregate counts.
   * Requires field agent capability.
   */
  @Mutation(() => ObservationBatchResult)
  @UseGuards(FieldAgentGuard)
  submitFieldObservationBatch(
    @Args('inputs', { type: () => [SubmitObservationInput] }) inputs: SubmitObservationInput[],
    @CurrentFarmer() user: Farmer,
  ): Promise<ObservationBatchResult> {
    if (inputs.length > 50) throw new Error('Batch limit is 50 observations');
    return this.fieldService.submitBatch(inputs, user.id);
  }

  /**
   * Updates a SUBMITTED observation. Only the original submitter may edit it.
   * Requires field agent capability.
   */
  @Mutation(() => FieldObservation)
  @UseGuards(FieldAgentGuard)
  updateFieldObservation(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: SubmitObservationInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldObservation> {
    return this.fieldService.update(id, user.id, input);
  }

  /**
   * Deletes a SUBMITTED observation. Only the original submitter may delete it.
   * Requires field agent capability.
   */
  @Mutation(() => Boolean)
  @UseGuards(FieldAgentGuard)
  deleteFieldObservation(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<boolean> {
    return this.fieldService.remove(id, user.id);
  }

  /** Returns all observations submitted by the authenticated user. Requires field agent capability. */
  @Query(() => [FieldObservation])
  @UseGuards(FieldAgentGuard)
  myFieldObservations(@CurrentFarmer() user: Farmer): Promise<FieldObservation[]> {
    return this.fieldService.myObservations(user.id);
  }

  /** Returns a single observation by ID. Open to any authenticated user. */
  @Query(() => FieldObservation, { nullable: true })
  fieldObservation(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<FieldObservation | null> {
    return this.fieldService.findById(id);
  }

  // ── Admin endpoints ──────────────────────────────────────────────────────────

  /** Returns all observations with optional filters. Restricted to `super_admin`. */
  @Query(() => [FieldObservation])
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  adminFieldObservations(
    @Args('status', { nullable: true, type: () => ObservationStatus }) status?: ObservationStatus,
    @Args('cropId', { nullable: true }) cropId?: string,
    @Args('region', { nullable: true }) region?: string,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
  ): Promise<FieldObservation[]> {
    return this.fieldService.adminListObservations({ status, cropId, region, from, to });
  }

  /**
   * Approves an observation and publishes it as a market price point. Optionally
   * overrides the observed price before publishing. Restricted to `super_admin`.
   */
  @Mutation(() => FieldObservation)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  approveFieldObservation(
    @Args('id', { type: () => ID }) id: string,
    @Args('adjustedPrice', { nullable: true, type: () => Number }) adjustedPrice: number | undefined,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldObservation> {
    return this.fieldService.approve(id, user.id, adjustedPrice);
  }

  /** Rejects an observation with a reason note. Restricted to `super_admin`. */
  @Mutation(() => FieldObservation)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  rejectFieldObservation(
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldObservation> {
    return this.fieldService.reject(id, user.id, reason);
  }

  /**
   * Grants field agent capability to a user. Idempotent. Sets
   * `farmer.isFieldAgent = true`. Restricted to `super_admin`.
   */
  @Mutation(() => FieldAgentCapability)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  grantFieldAgentCapability(
    @Args('userId', { type: () => ID }) userId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldAgentCapability> {
    return this.fieldService.grantFieldAgent(userId, user.id);
  }

  /** Revokes field agent capability and sets `farmer.isFieldAgent = false`. Restricted to `super_admin`. */
  @Mutation(() => Boolean)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  revokeFieldAgentCapability(
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<boolean> {
    return this.fieldService.revokeFieldAgent(userId);
  }

  /** Returns all active field agent capability records. Restricted to `super_admin`. */
  @Query(() => [FieldAgentCapability])
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  fieldAgents(): Promise<FieldAgentCapability[]> {
    return this.fieldService.listFieldAgents();
  }
}
