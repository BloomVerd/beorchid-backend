import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FarmService } from './farm.service';
import { Farm } from './entities/farm.entity';
import { IotDevice } from './entities/iot-device.entity';
import { ImageData } from './entities/image-data.entity';
import { CreateFarmInput } from './inputs/create-farm.input';
import { UpdateFarmCoordinatesInput } from './inputs/update-farm-coordinates.input';
import { UpdateFarmPhotoInput } from './inputs/update-farm-photo.input';
import { UpdateFarmSoilDataInput } from './inputs/update-farm-soil-data.input';
import { UploadFarmImagesInput } from './inputs/upload-farm-images.input';
import { RegisterIotDeviceInput } from './inputs/register-iot-device.input';
import { TriggerIotDeviceInput } from './inputs/trigger-iot-device.input';
import { PaginatedFarms, PaginatedImages } from './types/farm.types';
import { PaginatedIotToolCalls } from './types/iot-tool-call.types';
import { IotToolCall } from './entities/iot-tool-call.entity';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for the farm module. All operations require JWT authentication
 * via `GqlJwtAuthGuard`; the authenticated farmer is injected by `@CurrentFarmer()`.
 *
 * Covers the full farm lifecycle: creation, setup steps (coordinates, photo, soil
 * data), image management, IoT device registration/management, and read queries.
 */
@Resolver(() => Farm)
export class FarmResolver {
  constructor(private readonly farmService: FarmService) {}

  // ─── Mutations ───────────────────────────────────────────────────────────────

  /** Creates a new farm, respecting the subscription plan's farm limit. */
  @Mutation(() => Farm)
  @UseGuards(GqlJwtAuthGuard)
  addFarm(
    @Args('input') input: CreateFarmInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.addFarm(farmer.id, input);
  }

  /** Replaces the farm boundary coordinates and recomputes the centre-point. */
  @Mutation(() => Farm)
  @UseGuards(GqlJwtAuthGuard)
  updateFarmCoordinates(
    @Args('farmId') farmId: string,
    @Args('input') input: UpdateFarmCoordinatesInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.updateFarmCoordinates(farmer.id, farmId, input);
  }

  /** Saves the farm's setup photo URL and optional GPS coordinates. */
  @Mutation(() => Farm)
  @UseGuards(GqlJwtAuthGuard)
  updateFarmPhoto(
    @Args('farmId') farmId: string,
    @Args('input') input: UpdateFarmPhotoInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.updateFarmPhoto(farmer.id, farmId, input);
  }

  /** Updates soil type, crop density, and linked IoT device IDs. */
  @Mutation(() => Farm)
  @UseGuards(GqlJwtAuthGuard)
  updateFarmSoilData(
    @Args('farmId') farmId: string,
    @Args('input') input: UpdateFarmSoilDataInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.updateFarmSoilData(farmer.id, farmId, input);
  }

  /** Marks the farm COMPLETE and dispatches setup-complete notifications. */
  @Mutation(() => Farm)
  @UseGuards(GqlJwtAuthGuard)
  completeSetup(
    @Args('farmId') farmId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.completeSetup(farmer.id, farmId);
  }

  /**
   * Save one or more pre-uploaded images to a farm.
   * Images should be uploaded client-side via the imageUploadUrl pre-signed URL
   * first, then their CloudFront URLs passed here along with GPS coordinates and
   * the prediction type(s) each image is intended for.
   * Optionally attach to a PredictionRange for scheduled batch analysis.
   */
  @Mutation(() => [ImageData])
  @UseGuards(GqlJwtAuthGuard)
  uploadFarmImages(
    @Args('farmId') farmId: string,
    @Args('input') input: UploadFarmImagesInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.uploadFarmImages(farmer.id, farmId, input);
  }

  /** Provisions an AWS IoT Thing + X.509 certificate and persists the device. */
  @Mutation(() => IotDevice)
  @UseGuards(GqlJwtAuthGuard)
  registerIotDevice(
    @Args('farmId') farmId: string,
    @Args('input') input: RegisterIotDeviceInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.registerIotDevice(farmer.id, farmId, input);
  }

  /** Detaches and deletes the IoT Thing + certificate from AWS and the database. */
  @Mutation(() => Boolean)
  @UseGuards(GqlJwtAuthGuard)
  deleteIotDevice(
    @Args('farmId') farmId: string,
    @Args('deviceId') deviceId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.deleteIotDevice(farmer.id, farmId, deviceId);
  }

  /** Activates the device certificate in AWS IoT and sets `is_active = true`. */
  @Mutation(() => IotDevice)
  @UseGuards(GqlJwtAuthGuard)
  activateIotDevice(
    @Args('farmId') farmId: string,
    @Args('deviceId') deviceId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.activateIotDevice(farmer.id, farmId, deviceId);
  }

  /** Erases certificate/key fields from the DB after the farmer downloads the credential bundle. */
  @Mutation(() => Boolean)
  @UseGuards(GqlJwtAuthGuard)
  clearIotDeviceCert(
    @Args('farmId') farmId: string,
    @Args('deviceId') deviceId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.clearIotDeviceCert(farmer.id, farmId, deviceId);
  }

  /** Sends a command to an active IoT device via an AWS IoT Job and returns the tracking record. */
  @Mutation(() => IotToolCall)
  @UseGuards(GqlJwtAuthGuard)
  triggerIotDevice(
    @Args('farmId') farmId: string,
    @Args('deviceId') deviceId: string,
    @Args('input') input: TriggerIotDeviceInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.triggerIotDevice(farmer.id, farmId, deviceId, input);
  }

  /** Deletes a single farm image record. */
  @Mutation(() => Boolean)
  @UseGuards(GqlJwtAuthGuard)
  deleteFarmImage(
    @Args('farmId') farmId: string,
    @Args('imageId') imageId: string,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.deleteFarmImage(farmer.id, farmId, imageId);
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  /** Returns a paginated list of the authenticated farmer's farms. */
  @Query(() => PaginatedFarms)
  @UseGuards(GqlJwtAuthGuard)
  listFarms(
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.listFarms(farmer.id, page, limit);
  }

  /** Returns a single farm with coordinates, images, and IoT devices. */
  @Query(() => Farm)
  @UseGuards(GqlJwtAuthGuard)
  getFarm(@Args('farmId') farmId: string, @CurrentFarmer() farmer: Farmer) {
    return this.farmService.getFarm(farmer.id, farmId);
  }

  /** Returns the last 24 hours of IoT tool calls for a farm, paginated. */
  @Query(() => PaginatedIotToolCalls)
  @UseGuards(GqlJwtAuthGuard)
  listIotToolCalls(
    @Args('farmId') farmId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.listIotToolCalls(farmer.id, farmId, page, limit);
  }

  /** Returns paginated farm images, optionally filtered by year, month, and week number. */
  @Query(() => PaginatedImages)
  @UseGuards(GqlJwtAuthGuard)
  listFarmImages(
    @Args('farmId') farmId: string,
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @Args('year', { type: () => Int, nullable: true }) year: number | null,
    @Args('month', { type: () => Int, nullable: true }) month: number | null,
    @Args('week', { type: () => Int, nullable: true }) week: number | null,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.farmService.listFarmImages(
      farmer.id,
      farmId,
      page,
      limit,
      year ?? undefined,
      month ?? undefined,
      week ?? undefined,
    );
  }
}
