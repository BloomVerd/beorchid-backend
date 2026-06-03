import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Farm, SetupStatus } from './entities/farm.entity';
import { IotDevice } from './entities/iot-device.entity';
import { IotToolCall, IotCommandType, IotToolCallStatus } from './entities/iot-tool-call.entity';
import { Farmer } from '../farmer/entities/farmer.entity';
import { Coordinate } from './entities/coordinate.entity';
import { ImageData } from './entities/image-data.entity';
import { PredictionRange } from '../predictions/entities/prediction-range.entity';
import { CreateFarmInput } from './inputs/create-farm.input';
import { UpdateFarmCoordinatesInput } from './inputs/update-farm-coordinates.input';
import { UpdateFarmPhotoInput } from './inputs/update-farm-photo.input';
import { UpdateFarmSoilDataInput } from './inputs/update-farm-soil-data.input';
import { UploadFarmImagesInput } from './inputs/upload-farm-images.input';
import { RegisterIotDeviceInput } from './inputs/register-iot-device.input';
import { TriggerIotDeviceInput } from './inputs/trigger-iot-device.input';
import { PaginatedFarms, PaginatedImages } from './types/farm.types';
import { PaginatedIotToolCalls } from './types/iot-tool-call.types';

@Injectable()
export class FarmService {
  constructor(
    @InjectRepository(Farm)
    private farmRepository: Repository<Farm>,
    @InjectRepository(ImageData)
    private imageRepository: Repository<ImageData>,
    @InjectRepository(IotToolCall)
    private iotToolCallRepository: Repository<IotToolCall>,
    private configService: ConfigService,
  ) {}

  private buildIotClient(): AWS.Iot | null {
    const region = this.configService.get<string>('IOT_REGION');
    const accessKeyId = this.configService.get<string>('IOT_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('IOT_SECRET_ACCESS_KEY');
    if (!region || !accessKeyId || !secretAccessKey) return null;
    return new AWS.Iot({ region, accessKeyId, secretAccessKey });
  }

  private buildIotDataClient(): AWS.IotData | null {
    const endpoint = this.configService.get<string>('IOT_DATA_ENDPOINT');
    const region = this.configService.get<string>('IOT_REGION');
    const accessKeyId = this.configService.get<string>('IOT_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('IOT_SECRET_ACCESS_KEY');
    if (!endpoint || !region || !accessKeyId || !secretAccessKey) return null;
    return new AWS.IotData({ endpoint, region, accessKeyId, secretAccessKey });
  }

  async addFarm(farmerId: string, input: CreateFarmInput): Promise<Farm> {
    return this.farmRepository.manager.transaction(async (em) => {
      const farmer = await em.findOne(Farmer, { where: { id: farmerId } });
      if (!farmer) throw new BadRequestException('Farmer not found');

      const farmCount = await em.count(Farm, {
        where: { farmer: { id: farmerId } },
      });
      if (farmCount >= 10)
        throw new BadRequestException(
          'Farmers cannot create more than 10 farms',
        );

      const farm = em.create(Farm, {
        name: input.name,
        crop_type: input.crop_type,
        variety: input.variety,
        farm_size: input.farm_size,
        farm_type: input.farm_type,
        farmer,
      });

      return em.save(farm);
    });
  }

  async listFarms(
    farmerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedFarms> {
    const [data, total] = await this.farmRepository.findAndCount({
      where: { farmer: { id: farmerId } },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) };
  }

  async getFarm(farmerId: string, farmId: string): Promise<Farm> {
    const farm = await this.farmRepository.findOne({
      where: { id: farmId, farmer: { id: farmerId } },
      relations: ['coordinates', 'farm_images', 'iot_devices'],
    });
    if (!farm) throw new BadRequestException('Farm not found');
    return farm;
  }

  async updateFarmCoordinates(
    farmerId: string,
    farmId: string,
    input: UpdateFarmCoordinatesInput,
  ): Promise<Farm> {
    return this.farmRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
      });
      if (!farm) throw new BadRequestException('Farm not found');

      await em.delete(Coordinate, { farm: { id: farmId } });

      const newCoords = input.coordinates.map((c) =>
        em.create(Coordinate, { order: c.order, lat: c.lat, lon: c.lon, farm }),
      );
      await em.save(newCoords);

      if (farm.setup_status === SetupStatus.PENDING) {
        farm.setup_status = SetupStatus.IN_PROGRESS;
      }
      const saved = await em.save(farm);

      // Return with freshly loaded coordinates
      const reloaded = await em.findOne(Farm, {
        where: { id: saved.id },
        relations: ['coordinates', 'farm_images'],
      });
      return reloaded ?? saved;
    });
  }

  async updateFarmPhoto(
    farmerId: string,
    farmId: string,
    input: UpdateFarmPhotoInput,
  ): Promise<Farm> {
    return this.farmRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
      });
      if (!farm) throw new BadRequestException('Farm not found');

      farm.setup_photo_url = input.url;
      if (input.lat !== undefined) farm.setup_photo_lat = input.lat;
      if (input.lon !== undefined) farm.setup_photo_lon = input.lon;

      if (farm.setup_status === SetupStatus.PENDING) {
        farm.setup_status = SetupStatus.IN_PROGRESS;
      }

      return em.save(farm);
    });
  }

  async updateFarmSoilData(
    farmerId: string,
    farmId: string,
    input: UpdateFarmSoilDataInput,
  ): Promise<Farm> {
    return this.farmRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
      });
      if (!farm) throw new BadRequestException('Farm not found');

      if (input.soil_type !== undefined) farm.soil_type = input.soil_type;
      if (input.crop_density !== undefined) farm.crop_density = input.crop_density;
      if (input.iot_device_ids !== undefined) farm.iot_device_ids = input.iot_device_ids;

      if (farm.setup_status === SetupStatus.PENDING) {
        farm.setup_status = SetupStatus.IN_PROGRESS;
      }

      return em.save(farm);
    });
  }

  async completeSetup(farmerId: string, farmId: string): Promise<Farm> {
    return this.farmRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
        relations: ['coordinates', 'farm_images'],
      });
      if (!farm) throw new BadRequestException('Farm not found');

      farm.setup_status = SetupStatus.COMPLETE;
      return em.save(farm);
    });
  }

  async updateFarmCoordinateData(
    farmerId: string,
    farmId: string,
    coordinates: { order: number; lat: number; lon: number }[],
  ) {
    return this.farmRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
      });
      if (!farm) throw new BadRequestException('Farm not found');

      await em.delete(Coordinate, { farm: { id: farmId } });

      const newCoords = coordinates.map((c) =>
        em.create(Coordinate, { ...c, farm }),
      );
      return em.save(newCoords);
    });
  }

  /**
   * Saves one or more pre-uploaded images (CloudFront URLs) to a farm.
   *
   * Images are uploaded client-side via pre-signed S3 URLs (see imageUploadUrl
   * query). This mutation just persists the metadata + associates with the farm.
   *
   * Passing predictionRangeId is optional — images without a range are
   * "unscheduled" and are still read by the LLM pipeline when health is computed.
   */
  async uploadFarmImages(
    farmerId: string,
    farmId: string,
    input: UploadFarmImagesInput,
  ): Promise<ImageData[]> {
    return this.farmRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
      });
      if (!farm) throw new BadRequestException('Farm not found');

      // Resolve prediction range: explicit id > current week's range > auto-create
      let predictionRange: PredictionRange | null = null;

      if (input.predictionRangeId) {
        predictionRange = await em.findOne(PredictionRange, {
          where: { id: input.predictionRangeId, farm: { id: farmId } },
        });
        if (!predictionRange) {
          throw new BadRequestException('Prediction range not found for this farm');
        }
      } else {
        // Compute current ISO week boundaries (Mon 00:00 → Sun 23:59:59)
        const now = new Date();
        const dow = now.getDay(); // 0 = Sunday
        const diffToMonday = dow === 0 ? -6 : 1 - dow;

        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() + diffToMonday);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        predictionRange = await em.findOne(PredictionRange, {
          where: { farm: { id: farmId }, week_start: weekStart },
        });

        if (!predictionRange) {
          predictionRange = await em.save(
            em.create(PredictionRange, { farm, week_start: weekStart, week_end: weekEnd }),
          );
        }
      }

      const images = input.images.map((item) =>
        em.create(ImageData, {
          url: item.url,
          lat: item.lat,
          lon: item.lon,
          prediction_types: item.predictionTypes,
          prediction_range: predictionRange,
          farm,
        }),
      );

      return em.save(images);
    });
  }

  async registerIotDevice(
    farmerId: string,
    farmId: string,
    input: RegisterIotDeviceInput,
  ): Promise<IotDevice> {
    return this.farmRepository.manager.transaction(async (em) => {
      const farm = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
      });
      if (!farm) throw new BadRequestException('Farm not found');

      const deviceId = uuidv4();
      const thingName = `farm_${farmId}_${deviceId}`;

      let certificateId: string | undefined;
      let certificateArn: string | undefined;
      let certificatePem: string | undefined;
      let privateKey: string | undefined;
      let publicKey: string | undefined;

      const iotClient = this.buildIotClient();
      if (iotClient) {
        await iotClient.createThing({ thingName }).promise();

        const certResponse = await iotClient
          .createKeysAndCertificate({ setAsActive: false })
          .promise();

        certificateId = certResponse.certificateId;
        certificateArn = certResponse.certificateArn;
        certificatePem = certResponse.certificatePem;
        privateKey = certResponse.keyPair?.PrivateKey;
        publicKey = certResponse.keyPair?.PublicKey;

        await iotClient
          .attachThingPrincipal({ thingName, principal: certificateArn! })
          .promise();

        const policyName = this.configService.get<string>('IOT_DEVICE_POLICY_NAME');
        if (policyName) {
          await iotClient
            .attachPolicy({ policyName, target: certificateArn! })
            .promise();
        }
      }

      const device = em.create(IotDevice, {
        device_id: deviceId,
        label: input.label,
        device_type: input.device_type,
        is_active: false,
        thing_name: thingName,
        certificate_id: certificateId,
        certificate_arn: certificateArn,
        certificate_pem: certificatePem,
        private_key: privateKey,
        public_key: publicKey,
        farm,
      });

      return em.save(device);
    });
  }

  async deleteIotDevice(
    farmerId: string,
    farmId: string,
    deviceId: string,
  ): Promise<boolean> {
    return this.farmRepository.manager.transaction(async (em) => {
      const device = await em.findOne(IotDevice, {
        where: { id: deviceId, farm: { id: farmId, farmer: { id: farmerId } } },
      });
      if (!device) throw new BadRequestException('IoT device not found');

      const iotClient = this.buildIotClient();
      if (iotClient && device.certificate_arn && device.thing_name) {
        try {
          await iotClient
            .detachThingPrincipal({ thingName: device.thing_name, principal: device.certificate_arn })
            .promise();
        } catch (_) { /* already detached */ }

        if (device.certificate_id) {
          try {
            await iotClient
              .updateCertificate({ certificateId: device.certificate_id, newStatus: 'INACTIVE' })
              .promise();
            await iotClient
              .deleteCertificate({ certificateId: device.certificate_id, forceDelete: true })
              .promise();
          } catch (_) { /* already deleted */ }
        }

        try {
          await iotClient.deleteThing({ thingName: device.thing_name }).promise();
        } catch (_) { /* already deleted */ }
      }

      await em.remove(device);
      return true;
    });
  }

  async activateIotDevice(
    farmerId: string,
    farmId: string,
    deviceId: string,
  ): Promise<IotDevice> {
    return this.farmRepository.manager.transaction(async (em) => {
      const device = await em.findOne(IotDevice, {
        where: { id: deviceId, farm: { id: farmId, farmer: { id: farmerId } } },
      });
      if (!device) throw new BadRequestException('IoT device not found');

      const iotClient = this.buildIotClient();
      if (iotClient && device.certificate_id) {
        await iotClient
          .updateCertificate({ certificateId: device.certificate_id, newStatus: 'ACTIVE' })
          .promise();
      }

      device.is_active = true;
      return em.save(device);
    });
  }

  async clearIotDeviceCert(
    farmerId: string,
    farmId: string,
    deviceId: string,
  ): Promise<boolean> {
    return this.farmRepository.manager.transaction(async (em) => {
      const device = await em.findOne(IotDevice, {
        where: { id: deviceId, farm: { id: farmId, farmer: { id: farmerId } } },
      });
      if (!device) throw new BadRequestException('IoT device not found');

      device.certificate_pem = undefined;
      device.private_key = undefined;
      device.public_key = undefined;
      await em.save(device);
      return true;
    });
  }

  async triggerIotDevice(
    farmerId: string | null,
    farmId: string,
    deviceId: string,
    input: TriggerIotDeviceInput,
  ): Promise<IotToolCall> {
    const whereClause: Record<string, unknown> = { id: deviceId, farm: { id: farmId } };
    if (farmerId) {
      (whereClause['farm'] as Record<string, unknown>)['farmer'] = { id: farmerId };
    }

    const device = await this.farmRepository.manager.findOne(IotDevice, {
      where: whereClause as any,
      relations: ['farm'],
    });
    if (!device) throw new BadRequestException('IoT device not found');
    if (!device.is_active) throw new BadRequestException('IoT device is not active');

    const toolCall = this.iotToolCallRepository.create({
      command_type: input.command_type as IotCommandType,
      parameters: input.parameters,
      status: IotToolCallStatus.PENDING,
      requested_by: farmerId ? 'user' : 'ai',
      iot_device: device,
    });
    const saved = await this.iotToolCallRepository.save(toolCall);

    const iotData = this.buildIotDataClient();
    if (iotData && device.thing_name) {
      const topic = `farm/${farmId}/devices/${device.thing_name}/commands`;
      const payload = JSON.stringify({
        tool_call_id: saved.id,
        command_type: input.command_type,
        parameters: input.parameters ?? {},
      });
      await iotData.publish({ topic, payload }).promise();
    }

    return saved;
  }

  async listIotToolCalls(
    farmerId: string,
    farmId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedIotToolCalls> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [data, total] = await this.iotToolCallRepository
      .createQueryBuilder('tc')
      .leftJoinAndSelect('tc.iot_device', 'device')
      .leftJoin('device.farm', 'farm')
      .leftJoin('farm.farmer', 'farmer')
      .where('farm.id = :farmId', { farmId })
      .andWhere('farmer.id = :farmerId', { farmerId })
      .andWhere('tc.createdAt >= :since', { since })
      .orderBy('tc.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, lastPage: Math.ceil(total / limit) };
  }

  async handleIotWebhook(
    body: { tool_call_id: string; status: 'COMPLETED' | 'FAILED'; response?: Record<string, unknown> },
    secret: string,
  ): Promise<IotToolCall & { farmId: string }> {
    const expectedSecret = this.configService.get<string>('IOT_WEBHOOK_SECRET');
    if (expectedSecret && secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const toolCall = await this.iotToolCallRepository.findOne({
      where: { id: body.tool_call_id },
      relations: ['iot_device', 'iot_device.farm'],
    });
    if (!toolCall) throw new BadRequestException('IoT tool call not found');

    toolCall.status = body.status === 'COMPLETED' ? IotToolCallStatus.COMPLETED : IotToolCallStatus.FAILED;
    if (body.response) toolCall.response = body.response;
    await this.iotToolCallRepository.save(toolCall);

    return Object.assign(toolCall, { farmId: toolCall.iot_device.farm.id });
  }

  async deleteFarmImage(
    farmerId: string,
    farmId: string,
    imageId: string,
  ): Promise<boolean> {
    const farm = await this.farmRepository.findOne({
      where: { id: farmId, farmer: { id: farmerId } },
    });
    if (!farm) throw new BadRequestException('Farm not found');

    const image = await this.imageRepository.findOne({
      where: { id: imageId, farm: { id: farmId } },
    });
    if (!image) throw new BadRequestException('Image not found');

    await this.imageRepository.remove(image);
    return true;
  }

  async listFarmImages(
    farmerId: string,
    farmId: string,
    page: number,
    limit: number,
    year?: number,
    month?: number,
    week?: number,
  ): Promise<PaginatedImages> {
    const farm = await this.farmRepository.findOne({
      where: { id: farmId, farmer: { id: farmerId } },
    });
    if (!farm) throw new BadRequestException('Farm not found');

    const where: FindOptionsWhere<ImageData> = { farm: { id: farmId } };

    if (year !== undefined && month !== undefined && week !== undefined) {
      const dayStart = (week - 1) * 7 + 1;
      const weekStart = new Date(year, month - 1, dayStart, 0, 0, 0, 0);
      // Week 4 always extends to end of month so partial last weeks are included.
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const dayEnd = week >= 4 ? lastDayOfMonth : week * 7;
      const weekEnd = new Date(year, month - 1, dayEnd, 23, 59, 59, 999);
      where.createdAt = Between(weekStart, weekEnd) as any;
    }

    const [data, total] = await this.imageRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, lastPage: Math.ceil(total / limit) || 1 };
  }
}
