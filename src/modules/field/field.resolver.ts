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

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class FieldResolver {
  constructor(private readonly fieldService: FieldService) {}

  @Mutation(() => FieldObservation)
  @UseGuards(FieldAgentGuard)
  submitFieldObservation(
    @Args('input') input: SubmitObservationInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldObservation> {
    return this.fieldService.submit(input, user.id);
  }

  @Mutation(() => ObservationBatchResult)
  @UseGuards(FieldAgentGuard)
  submitFieldObservationBatch(
    @Args('inputs', { type: () => [SubmitObservationInput] }) inputs: SubmitObservationInput[],
    @CurrentFarmer() user: Farmer,
  ): Promise<ObservationBatchResult> {
    if (inputs.length > 50) throw new Error('Batch limit is 50 observations');
    return this.fieldService.submitBatch(inputs, user.id);
  }

  @Mutation(() => FieldObservation)
  @UseGuards(FieldAgentGuard)
  updateFieldObservation(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: SubmitObservationInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldObservation> {
    return this.fieldService.update(id, user.id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(FieldAgentGuard)
  deleteFieldObservation(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<boolean> {
    return this.fieldService.remove(id, user.id);
  }

  @Query(() => [FieldObservation])
  @UseGuards(FieldAgentGuard)
  myFieldObservations(@CurrentFarmer() user: Farmer): Promise<FieldObservation[]> {
    return this.fieldService.myObservations(user.id);
  }

  @Query(() => FieldObservation, { nullable: true })
  fieldObservation(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<FieldObservation | null> {
    return this.fieldService.findById(id);
  }

  // ── Admin endpoints ──────────────────────────────────────────────────────────

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

  @Mutation(() => FieldAgentCapability)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  grantFieldAgentCapability(
    @Args('userId', { type: () => ID }) userId: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<FieldAgentCapability> {
    return this.fieldService.grantFieldAgent(userId, user.id);
  }

  @Mutation(() => Boolean)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  revokeFieldAgentCapability(
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<boolean> {
    return this.fieldService.revokeFieldAgent(userId);
  }

  @Query(() => [FieldAgentCapability])
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  fieldAgents(): Promise<FieldAgentCapability[]> {
    return this.fieldService.listFieldAgents();
  }
}
