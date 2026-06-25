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

@Resolver()
@UseGuards(GqlJwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class IngestionResolver {
  constructor(private readonly ingestionService: IngestionService) {}

  @Mutation(() => MarketPricePoint)
  injectPricePoint(
    @Args('input') input: InjectPricePointInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<MarketPricePoint> {
    return this.ingestionService.injectPricePoint(input, user.id);
  }

  @Mutation(() => MarketPricePoint)
  correctPricePoint(
    @Args('id', { type: () => ID }) id: string,
    @Args('newPriceInPesewas', { type: () => Number }) newPriceInPesewas: number,
    @CurrentFarmer() user: Farmer,
  ): Promise<MarketPricePoint> {
    return this.ingestionService.correctPricePoint(id, newPriceInPesewas, user.id);
  }

  @Query(() => [DataIngestionJob])
  ingestionJobs(@CurrentFarmer() user: Farmer): Promise<DataIngestionJob[]> {
    return this.ingestionService.listJobs(user.id);
  }

  @Query(() => DataIngestionJob)
  ingestionJob(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<DataIngestionJob> {
    return this.ingestionService.findJobById(id);
  }

  @Mutation(() => ExternalFeed)
  createExternalFeed(
    @Args('input') input: CreateExternalFeedInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<ExternalFeed> {
    return this.ingestionService.createFeed(input, user.id);
  }

  @Query(() => [ExternalFeed])
  externalFeeds(): Promise<ExternalFeed[]> {
    return this.ingestionService.listFeeds();
  }

  @Query(() => ExternalFeed)
  externalFeed(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ExternalFeed> {
    return this.ingestionService.findFeedById(id);
  }

  @Mutation(() => ExternalFeed)
  updateExternalFeed(
    @Args('id', { type: () => ID }) id: string,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
    @Args('scheduleCron', { nullable: true }) scheduleCron?: string,
  ): Promise<ExternalFeed> {
    return this.ingestionService.updateFeed(id, { isActive, scheduleCron });
  }

  @Mutation(() => Boolean)
  deleteExternalFeed(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.ingestionService.deleteFeed(id);
  }

  @Mutation(() => DataIngestionJob)
  triggerFeedNow(
    @Args('id', { type: () => ID }) id: string,
    @CurrentFarmer() user: Farmer,
  ): Promise<DataIngestionJob> {
    return this.ingestionService.triggerFeedNow(id, user.id);
  }
}
