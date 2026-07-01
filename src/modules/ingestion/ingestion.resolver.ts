import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { DataIngestionJob } from './entities/data-ingestion-job.entity';
import { ExternalFeed } from './entities/external-feed.entity';
import { InjectPricePointInput } from './inputs/inject-price-point.input';
import { CreateExternalFeedInput } from './inputs/create-external-feed.input';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { RolesGuard, Roles } from '../roles';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';
import { MarketPricePoint } from '../market/entities/market-price-point.entity';

/**
 * GraphQL resolver for admin ingestion operations. All mutations and queries
 * require a valid JWT and the `super_admin` role — guards are applied at the
 * class level via `@UseGuards(GqlJwtAuthGuard, RolesGuard)` + `@Roles('super_admin')`.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class IngestionResolver {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Inserts a single market price point immediately. Resolves `cropSlug` to
   * `cropId` when needed and enqueues a coin reprice job.
   */
  @Mutation(() => MarketPricePoint)
  injectPricePoint(
    @Args('input') input: InjectPricePointInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<MarketPricePoint> {
    return this.ingestionService.injectPricePoint(input, user.id);
  }

  /**
   * Supersedes an existing price point with a corrected value. The old row is
   * flagged `isSuperseded = true`; a new row is created and a coin reprice is
   * enqueued.
   */
  @Mutation(() => MarketPricePoint)
  correctPricePoint(
    @Args('id', { type: () => ID }) id: string,
    @Args('newPriceInPesewas', { type: () => Number }) newPriceInPesewas: number,
    @CurrentFarmer() user: Farmer,
  ): Promise<MarketPricePoint> {
    return this.ingestionService.correctPricePoint(id, newPriceInPesewas, user.id);
  }

  /** Returns all ingestion jobs submitted by the authenticated admin. */
  @Query(() => [DataIngestionJob])
  ingestionJobs(@CurrentFarmer() user: Farmer): Promise<DataIngestionJob[]> {
    return this.ingestionService.listJobs(user.id);
  }

  /** Returns a single ingestion job by ID. */
  @Query(() => DataIngestionJob)
  ingestionJob(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<DataIngestionJob> {
    return this.ingestionService.findJobById(id);
  }

  /** Creates a new external feed configuration. */
  @Mutation(() => ExternalFeed)
  createExternalFeed(
    @Args('input') input: CreateExternalFeedInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<ExternalFeed> {
    return this.ingestionService.createFeed(input, user.id);
  }

  /** Returns all external feed configurations. */
  @Query(() => [ExternalFeed])
  externalFeeds(): Promise<ExternalFeed[]> {
    return this.ingestionService.listFeeds();
  }

  /** Returns a single external feed configuration by ID. */
  @Query(() => ExternalFeed)
  externalFeed(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ExternalFeed> {
    return this.ingestionService.findFeedById(id);
  }

  /** Updates `isActive` or `scheduleCron` on an external feed. */
  @Mutation(() => ExternalFeed)
  updateExternalFeed(
    @Args('id', { type: () => ID }) id: string,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
    @Args('scheduleCron', { nullable: true }) scheduleCron?: string,
  ): Promise<ExternalFeed> {
    return this.ingestionService.updateFeed(id, { isActive, scheduleCron });
  }

  /** Permanently deletes an external feed configuration. */
  @Mutation(() => Boolean)
  deleteExternalFeed(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.ingestionService.deleteFeed(id);
  }

  /**
   * Immediately triggers a run for the given external feed by creating an
   * `EXTERNAL_FEED_RUN` ingestion job and enqueuing it.
   */
  @Mutation(() => DataIngestionJob)
  triggerFeedNow(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<DataIngestionJob> {
    return this.ingestionService.triggerFeedNow(id, user.id);
  }
}
