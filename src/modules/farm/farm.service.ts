import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as AWS from 'aws-sdk';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Farm, SetupStatus } from './entities/farm.entity';
import { IotDevice } from './entities/iot-device.entity';
import {
  IotToolCall,
  IotCommandType,
  IotToolCallStatus,
} from './entities/iot-tool-call.entity';
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
import { SubscriptionService } from '../payment/subscription.service';
import { throwSubscriptionLimitError } from 'src/common/exceptions/subscription.exceptions';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { EmailProducer } from '../email/email.producer';
import { SmsService } from '../sms/sms.service';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';

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
    private subscriptionService: SubscriptionService,
    private readonly notificationsService: NotificationsService,
    private readonly emailProducer: EmailProducer,
    private readonly smsService: SmsService,
    private readonly farmerSettingsService: FarmerSettingsService,
  ) {}

  private buildIotClient(): AWS.Iot | null {
    const region = this.configService.get<string>('IOT_REGION');
    const accessKeyId = this.configService.get<string>('IOT_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'IOT_SECRET_ACCESS_KEY',
    );
    if (!region || !accessKeyId || !secretAccessKey) return null;
    return new AWS.Iot({ region, accessKeyId, secretAccessKey });
  }

  private buildIotDataClient(): AWS.IotData | null {
    const endpoint = this.configService.get<string>('IOT_DATA_ENDPOINT');
    const region = this.configService.get<string>('IOT_REGION');
    const accessKeyId = this.configService.get<string>('IOT_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'IOT_SECRET_ACCESS_KEY',
    );
    if (!endpoint || !region || !accessKeyId || !secretAccessKey) return null;
    return new AWS.IotData({ endpoint, region, accessKeyId, secretAccessKey });
  }

  async addFarm(farmerId: string, input: CreateFarmInput): Promise<Farm> {
    const subscription =
      await this.subscriptionService.getActiveSubscription(farmerId);
    const maxFarms = subscription.plan.maxFarms;

    return this.farmRepository.manager.transaction(async (em) => {
      const farmer = await em.findOne(Farmer, { where: { id: farmerId } });
      if (!farmer) throw new BadRequestException('Farmer not found');

      const farmCount = await em.count(Farm, {
        where: { farmer: { id: farmerId } },
      });
      if (farmCount >= maxFarms)
        throwSubscriptionLimitError(
          `Your ${subscription.plan.displayName} plan allows up to ${maxFarms} farm${maxFarms === 1 ? '' : 's'}`,
          'maxFarms',
          subscription.plan.name,
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

      const totalLat = newCoords.reduce((sum, c) => sum + c.lat, 0);
      const totalLon = newCoords.reduce((sum, c) => sum + c.lon, 0);
      farm.lat = totalLat / newCoords.length;
      farm.lon = totalLon / newCoords.length;

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
      if (input.crop_density !== undefined)
        farm.crop_density = input.crop_density;
      if (input.iot_device_ids !== undefined)
        farm.iot_device_ids = input.iot_device_ids;

      if (farm.setup_status === SetupStatus.PENDING) {
        farm.setup_status = SetupStatus.IN_PROGRESS;
      }

      return em.save(farm);
    });
  }

  async completeSetup(farmerId: string, farmId: string): Promise<Farm> {
    const farm = await this.farmRepository.manager.transaction(async (em) => {
      const f = await em.findOne(Farm, {
        where: { id: farmId, farmer: { id: farmerId } },
        relations: ['coordinates', 'farm_images', 'farmer'],
      });
      if (!f) throw new BadRequestException('Farm not found');

      f.setup_status = SetupStatus.COMPLETE;
      return em.save(f);
    });

    await this.dispatchSetupNotification(farm);
    return farm;
  }

  private async dispatchSetupNotification(farm: Farm): Promise<void> {
    if (!farm.farmer) return;

    const settings = await this.farmerSettingsService.getOrCreate(
      farm.farmer.id,
    );

    const notification = await this.notificationsService.create(
      farm.farmer.id,
      {
        title: `${farm.name} setup is complete`,
        message:
          'Your farm is fully set up. Health monitoring and predictions are now active.',
        type: NotificationType.FARM_SETUP_COMPLETE,
      },
    );

    if (settings.notifyInApp) {
      this.notificationsService.pushToStream(farm.farmer.id, notification);
    }

    if (settings.notifyEmail) {
      await this.emailProducer.sendFarmSetupComplete({
        email: farm.farmer.email,
        firstName: farm.farmer.firstName,
        farmName: farm.name,
      });
    }

    if (settings.notifySms && settings.smsPhoneNumber) {
      await this.smsService.sendFarmSetupComplete(
        settings.smsPhoneNumber,
        farm.name,
      );
    }
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
          throw new BadRequestException(
            'Prediction range not found for this farm',
          );
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
            em.create(PredictionRange, {
              farm,
              week_start: weekStart,
              week_end: weekEnd,
            }),
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

      let thingArn: string | undefined;
      let certificateId: string | undefined;
      let certificateArn: string | undefined;
      let certificatePem: string | undefined;
      let privateKey: string | undefined;
      let publicKey: string | undefined;

      const iotClient = this.buildIotClient();
      if (iotClient) {
        const createThingResult = await iotClient
          .createThing({ thingName })
          .promise();
        thingArn = createThingResult.thingArn ?? undefined;

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

        const policyName = `farm_${farmId}_${deviceId}-Policy`;
        const policyDocument = JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['iot:Publish', 'iot:Receive', 'iot:PublishRetain'],
              Resource: [
                `arn:aws:iot:us-east-1:784608886729:topic/farms/${farmId}/${deviceId}/telemetry`,
                `arn:aws:iot:us-east-1:784608886729:topic/$aws/things/${thingName}/jobs/*`,
              ],
            },
            {
              Effect: 'Allow',
              Action: ['iot:Subscribe', 'iot:Receive'],
              Resource: [
                `arn:aws:iot:us-east-1:784608886729:topicfilter/farms/${farmId}/${deviceId}/telemetry`,
                `arn:aws:iot:us-east-1:784608886729:topicfilter/$aws/things/${thingName}/jobs/*`,
              ],
            },
            {
              Effect: 'Allow',
              Action: ['iot:Connect'],
              Resource: [
                'arn:aws:iot:us-east-1:784608886729:client/sdk-nodejs-*',
              ],
            },
          ],
        });
        await iotClient.createPolicy({ policyName, policyDocument }).promise();
        await iotClient
          .attachPolicy({ policyName, target: certificateArn! })
          .promise();
      }

      const device = em.create(IotDevice, {
        device_id: deviceId,
        label: input.label,
        device_type: input.device_type,
        is_active: false,
        thing_name: thingName,
        thing_arn: thingArn,
        certificate_id: certificateId,
        certificate_arn: certificateArn,
        certificate_pem: certificatePem,
        private_key: privateKey,
        public_key: publicKey,
        lat: input.lat ?? farm.lat,
        lon: input.lon ?? farm.lon,
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
            .detachThingPrincipal({
              thingName: device.thing_name,
              principal: device.certificate_arn,
            })
            .promise();
        } catch (_) {
          /* already detached */
        }

        if (device.certificate_id) {
          try {
            await iotClient
              .updateCertificate({
                certificateId: device.certificate_id,
                newStatus: 'INACTIVE',
              })
              .promise();
            await iotClient
              .deleteCertificate({
                certificateId: device.certificate_id,
                forceDelete: true,
              })
              .promise();
          } catch (_) {
            /* already deleted */
          }
        }

        try {
          await iotClient
            .deleteThing({ thingName: device.thing_name })
            .promise();
        } catch (_) {
          /* already deleted */
        }
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
          .updateCertificate({
            certificateId: device.certificate_id,
            newStatus: 'ACTIVE',
          })
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

  async downloadIotDevicePackage(
    farmerId: string,
    farmId: string,
    deviceId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const device = await this.farmRepository.manager.findOne(IotDevice, {
      where: {
        device_id: deviceId,
        farm: { id: farmId, farmer: { id: farmerId } },
      },
      relations: ['farm'],
    });
    if (!device) throw new BadRequestException('IoT device not found');

    const policyName = `farm_${farmId}_${deviceId}-Policy`;
    const thingName = device.thing_name ?? `farm_${farmId}_${deviceId}`;
    const policyContent = JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['iot:Publish', 'iot:Receive', 'iot:PublishRetain'],
            Resource: [
              `arn:aws:iot:us-east-1:784608886729:topic/farms/${farmId}/${deviceId}/telemetry`,
              `arn:aws:iot:us-east-1:784608886729:topic/$aws/things/${thingName}/jobs/*`,
            ],
          },
          {
            Effect: 'Allow',
            Action: ['iot:Subscribe', 'iot:Receive'],
            Resource: [
              `arn:aws:iot:us-east-1:784608886729:topicfilter/farms/${farmId}/${deviceId}/telemetry`,
              `arn:aws:iot:us-east-1:784608886729:topicfilter/$aws/things/${thingName}/jobs/*`,
            ],
          },
          {
            Effect: 'Allow',
            Action: ['iot:Connect'],
            Resource: [
              'arn:aws:iot:us-east-1:784608886729:client/sdk-nodejs-*',
            ],
          },
        ],
      },
      null,
      2,
    );

    const startSh = this.buildStartSh(farmId, deviceId);
    const indexTs = this.buildIndexTs(farmId, deviceId, thingName);
    const zipFilename = `farm_${farmId}_${deviceId}.zip`;

    const zip = new JSZip();
    zip.file(policyName, policyContent);
    zip.file(
      `farm_${farmId}_${deviceId}.cert.pem`,
      device.certificate_pem ?? '',
    );
    zip.file(
      `farm_${farmId}_${deviceId}.private.key`,
      device.private_key ?? '',
    );
    zip.file(`farm_${farmId}_${deviceId}.public.key`, device.public_key ?? '');
    zip.file('start.sh', startSh, { unixPermissions: 0o755 });
    zip.file('index.ts', indexTs);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
      platform: 'UNIX',
    });

    return { buffer, filename: zipFilename };
  }

  private buildStartSh(farmId: string, deviceId: string): string {
    return `#!/usr/bin/env bash
# stop script on error
set -e

# Check to see if root CA file exists, download if not
if [ ! -f ./root-CA.crt ]; then
  printf "\\nDownloading AWS IoT Root CA certificate from AWS...\\n"
  curl https://www.amazontrust.com/repository/AmazonRootCA1.pem > root-CA.crt
fi

CWD=\`pwd\`

# install AWS Device SDK for NodeJS if not already installed + pubsub sample
if [ ! -d ./aws-iot-device-sdk-js-v2 ]; then
  printf "\\nInstalling AWS SDK...\\n"
  git clone https://github.com/aws/aws-iot-device-sdk-js-v2.git --recursive
  cd aws-iot-device-sdk-js-v2
  npm install
  # samples require their own install
  cd $CWD
  cp index.ts aws-iot-device-sdk-js-v2/samples/node/mqtt/mqtt5_x509/index.ts
  cd aws-iot-device-sdk-js-v2/samples/node/mqtt/mqtt5_x509
  npm install
  cd $CWD
fi

# run pub/sub sample app using certificates downloaded in package
printf "\\nRunning pub/sub sample application...\\n"
node aws-iot-device-sdk-js-v2/samples/node/mqtt/mqtt5_x509/dist/index.js --endpoint aoltpnoui7ges-ats.iot.us-east-1.amazonaws.com --key farm_${farmId}_${deviceId}.private.key --cert farm_${farmId}_${deviceId}.cert.pem --client_id sdk-nodejs-v2 --topic farms/${farmId}/${deviceId}/telemetry
`;
  }

  private buildIndexTs(
    farmId: string,
    deviceId: string,
    thingName: string,
  ): string {
    return `/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0.
 */

import { mqtt5, iot } from "aws-iot-device-sdk-v2";
import { once } from "events";
import yargs from "yargs";
import { v4 as uuidv4 } from "uuid";

const TIMEOUT = 100000;
const FARM_ID = "${farmId}";
const DEVICE_ID = "${deviceId}";
const THING_NAME = "${thingName}";

const JOB_NOTIFY_TOPIC = \`$aws/things/\${THING_NAME}/jobs/notify\`;
const JOB_NOTIFY_NEXT_TOPIC = \`$aws/things/\${THING_NAME}/jobs/notify-next\`;
const JOB_GET_ACCEPTED_TOPIC_FILTER = \`$aws/things/\${THING_NAME}/jobs/+/get/accepted\`;
const JOB_GET_NEXT_ACCEPTED_TOPIC = \`$aws/things/\${THING_NAME}/jobs/$next/get/accepted\`;
const JOB_GET_ACCEPTED_PREFIX = \`$aws/things/\${THING_NAME}/jobs/\`;
const JOB_GET_NEXT_TOPIC = \`$aws/things/\${THING_NAME}/jobs/$next/get\`;

// --------------------------------- ARGUMENT PARSING -----------------------------------------
const args = yargs
  .option("endpoint", {
    alias: "e",
    description: "IoT endpoint hostname",
    type: "string",
    required: true,
  })
  .option("cert", {
    alias: "c",
    description:
      "Path to the certificate file to use during mTLS connection establishment",
    type: "string",
    required: true,
  })
  .option("key", {
    alias: "k",
    description:
      "Path to the private key file to use during mTLS connection establishment",
    type: "string",
    required: true,
  })
  .option("client_id", {
    alias: "C",
    description: "Client ID",
    type: "string",
    default: \`mqtt5-sample-\${uuidv4().substring(0, 8)}\`,
  })
  .option("topic", {
    alias: "t",
    description: "Topic",
    type: "string",
    default: \`farms/\${FARM_ID}/\${DEVICE_ID}/telemetry\`,
  })
  .option("count", {
    alias: "n",
    description: "Messages to publish (0 = infinite)",
    type: "number",
    default: 0,
  })
  .help().argv;

// --------------------------------- ARGUMENT PARSING END -----------------------------------------

interface SensorPayload {
  farm_id: string;
  device_id: string;
  metrics: {
    humidity: number;
    ph: number;
    soil_moisture: number;
    temperature: number;
  };
  ts: number;
}

async function executeCommand(
  commandType: string,
  parameters: Record<string, unknown>,
): Promise<void> {
  console.log(\`==== Executing command: \${commandType} with params: \${JSON.stringify(parameters)} ====\\n\`);
  switch (commandType) {
    case "IRRIGATE": {
      const durationMs = Math.min(
        ((parameters.duration_minutes as number) ?? 1) * 60000,
        10000,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
      break;
    }
    case "STOP_IRRIGATION":
    case "ACTIVATE_SENSOR":
    case "DEACTIVATE_SENSOR":
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      break;
    case "CAPTURE_IMAGE":
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      break;
    default:
      console.log(\`Unknown command type: \${commandType}\\n\`);
  }
  console.log(\`==== Command \${commandType} complete ====\\n\`);
}

async function handleJobNotify(
  client: mqtt5.Mqtt5Client,
  payloadStr: string,
): Promise<void> {
  let jobs: Record<string, Array<{ jobId: string }>> | undefined;
  try {
    const parsed = JSON.parse(payloadStr);
    jobs = parsed.jobs;
  } catch {
    return;
  }

  const pending = [
    ...(jobs?.["QUEUED"] ?? []),
    ...(jobs?.["IN_PROGRESS"] ?? []),
  ];

  if (pending.length === 0) {
    console.log("==== No pending jobs in notify ====\\n");
    return;
  }

  console.log(\`==== \${pending.length} job(s) pending — requesting all ====\\n\`);
  for (const { jobId } of pending) {
    await client.publish({
      topicName: \`$aws/things/\${THING_NAME}/jobs/\${jobId}/update\`,
      payload: JSON.stringify({ status: "IN_PROGRESS" }),
      qos: mqtt5.QoS.AtLeastOnce,
    });

    await client.publish({
      topicName: \`$aws/things/\${THING_NAME}/jobs/\${jobId}/get\`,
      payload: JSON.stringify({}),
      qos: mqtt5.QoS.AtLeastOnce,
    });
  }
}

async function handleJobExecution(
  client: mqtt5.Mqtt5Client,
  payloadStr: string,
): Promise<void> {
  let execution:
    | {
        jobId: string;
        jobDocument: {
          command_type: string;
          parameters: Record<string, unknown>;
        };
      }
    | undefined;
  try {
    const parsed = JSON.parse(payloadStr);
    execution = parsed.execution;
  } catch {
    return;
  }
  if (!execution) return;

  const { jobId, jobDocument } = execution;
  console.log(\`==== Received job \${jobId}: \${jobDocument.command_type} ====\\n\`);

  try {
    await client.publish({
      topicName: \`$aws/things/\${THING_NAME}/jobs/\${jobId}/update\`,
      payload: JSON.stringify({ status: "IN_PROGRESS" }),
      qos: mqtt5.QoS.AtLeastOnce,
    });

    await executeCommand(jobDocument.command_type, jobDocument.parameters ?? {});

    await client.publish({
      topicName: \`$aws/things/\${THING_NAME}/jobs/\${jobId}/update\`,
      payload: JSON.stringify({
        status: "SUCCEEDED",
        statusDetails: { result: "ok" },
      }),
      qos: mqtt5.QoS.AtLeastOnce,
    });
    console.log(\`==== Job \${jobId} reported SUCCEEDED ====\\n\`);
  } catch (err) {
    await client.publish({
      topicName: \`$aws/things/\${THING_NAME}/jobs/\${jobId}/update\`,
      payload: JSON.stringify({
        status: "FAILED",
        statusDetails: { error: String(err) },
      }),
      qos: mqtt5.QoS.AtLeastOnce,
    });
    console.log(\`==== Job \${jobId} reported FAILED: \${err} ====\\n\`);
  }
}

async function runSample() {
  console.log("\\nStarting MQTT5 X509 PubSub Sample\\n");

  let receivedCount = 0;

  console.log("==== Creating MQTT5 Client ====\\n");
  const builder =
    iot.AwsIotMqtt5ClientConfigBuilder.newDirectMqttBuilderWithMtlsFromPath(
      args.endpoint,
      args.cert,
      args.key,
    );

  builder.withConnectProperties({
    clientId: args.client_id,
    keepAliveIntervalSeconds: 1200,
  });

  const config = builder.build();
  const client = new mqtt5.Mqtt5Client(config);

  client.on(
    "messageReceived",
    async (eventData: mqtt5.MessageReceivedEvent) => {
      const message = eventData.message;
      const payload = message.payload
        ? Buffer.from(message.payload).toString("utf-8")
        : "";

      if (message.topicName === JOB_NOTIFY_TOPIC) {
        console.log(
          \`==== Received message from topic '\${message.topicName}': \${payload} ====\\n\`,
        );
        await handleJobNotify(client, payload);
        return;
      }

      if (message.topicName === JOB_NOTIFY_NEXT_TOPIC) {
        console.log(
          \`==== Received message from topic '\${message.topicName}': \${payload} ====\\n\`,
        );
        await handleJobExecution(client, payload);
        return;
      }

      if (
        message.topicName.startsWith(JOB_GET_ACCEPTED_PREFIX) &&
        message.topicName.endsWith("/get/accepted")
      ) {
        console.log(
          \`==== Received message from topic '\${message.topicName}': \${payload} ====\\n\`,
        );
        await handleJobExecution(client, payload);
        return;
      }

      receivedCount++;
      if (receivedCount === args.count) {
        setImmediate(() => client.emit("receivedAll"));
      }
    },
  );

  client.on("stopped", () => {
    console.log("Lifecycle Stopped\\n");
  });

  client.on("attemptingConnect", () => {
    console.log(
      \`Lifecycle Connection Attempt\\nConnecting to endpoint: '\${args.endpoint}' with client ID '\${args.client_id}'\`,
    );
  });

  client.on("connectionSuccess", (eventData: mqtt5.ConnectionSuccessEvent) => {
    console.log(
      \`Lifecycle Connection Success with reason code: \${eventData.connack.reasonCode}\\n\`,
    );
  });

  client.on("connectionFailure", (eventData: mqtt5.ConnectionFailureEvent) => {
    console.log(
      \`Lifecycle Connection Failure with exception: \${eventData.error}\`,
    );
  });

  client.on("disconnection", (eventData: mqtt5.DisconnectionEvent) => {
    const reasonCode = eventData.disconnect
      ? eventData.disconnect.reasonCode
      : "None";
    console.log(\`Lifecycle Disconnected with reason code: \${reasonCode}\`);
  });

  console.log("==== Starting client ====");
  client.start();

  const connectionSuccess = once(client, "connectionSuccess");
  await Promise.race([
    connectionSuccess,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), TIMEOUT),
    ),
  ]);

  console.log(\`==== Subscribing to topic '\${args.topic}' ====\`);
  const suback = await client.subscribe({
    subscriptions: [
      {
        topicFilter: args.topic,
        qos: mqtt5.QoS.AtLeastOnce,
      },
    ],
  });
  console.log(\`Suback received with reason code: \${suback.reasonCodes}\\n\`);

  console.log("==== Subscribing to IoT Jobs topics ====");
  await client.subscribe({
    subscriptions: [
      { topicFilter: JOB_NOTIFY_TOPIC, qos: mqtt5.QoS.AtLeastOnce },
      { topicFilter: JOB_NOTIFY_NEXT_TOPIC, qos: mqtt5.QoS.AtLeastOnce },
      {
        topicFilter: JOB_GET_ACCEPTED_TOPIC_FILTER,
        qos: mqtt5.QoS.AtLeastOnce,
      },
      { topicFilter: JOB_GET_NEXT_ACCEPTED_TOPIC, qos: mqtt5.QoS.AtLeastOnce },
    ],
  });
  console.log("==== Subscribed to IoT Jobs topics ====\\n");

  console.log("==== Requesting any pending jobs ====");
  await client.publish({
    topicName: JOB_GET_NEXT_TOPIC,
    payload: JSON.stringify({}),
    qos: mqtt5.QoS.AtLeastOnce,
  });

  if (args.count === 0) {
    console.log("==== Sending messages until program killed ====\\n");
  } else {
    console.log(\`==== Sending \${args.count} message(s) ====\\n\`);
  }

  let publishCount = 1;

  const rand = (min: number, max: number, decimals: number) =>
    parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

  while (publishCount <= args.count || args.count === 0) {
    const now = new Date();

    const payload: SensorPayload = {
      farm_id: FARM_ID,
      device_id: DEVICE_ID,
      metrics: {
        humidity: rand(30, 90, 1),
        ph: rand(4.0, 8.0, 1),
        soil_moisture: rand(20, 80, 1),
        temperature: rand(15, 40, 1),
      },
      ts: now.getTime() / 1000,
    };
    const message = JSON.stringify(payload);

    await client.publish({
      topicName: args.topic,
      payload: message,
      qos: mqtt5.QoS.AtLeastOnce,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    publishCount++;
  }

  if (receivedCount < args.count) {
    const receivedAll = once(client, "receivedAll");
    await Promise.race([
      receivedAll,
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
  console.log(\`\${receivedCount} message(s) received.\\n\`);

  console.log(\`==== Unsubscribing from topic '\${args.topic}' ====\`);
  const unsuback = await client.unsubscribe({
    topicFilters: [args.topic],
  });
  console.log(\`Unsubscribed with \${unsuback.reasonCodes}\\n\`);

  await client.unsubscribe({
    topicFilters: [
      JOB_NOTIFY_TOPIC,
      JOB_NOTIFY_NEXT_TOPIC,
      JOB_GET_ACCEPTED_TOPIC_FILTER,
      JOB_GET_NEXT_ACCEPTED_TOPIC,
    ],
  });

  console.log("==== Stopping Client ====");
  const stopped = once(client, "stopped");
  client.stop();

  await Promise.race([
    stopped,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Stop timeout")), TIMEOUT),
    ),
  ]);

  console.log("==== Client Stopped! ====");
  client.close();
}

runSample()
  .then(() => {
    process.exit(0);
  })
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
`;
  }

  async triggerIotDevice(
    farmerId: string | null,
    farmId: string,
    deviceId: string,
    input: TriggerIotDeviceInput,
  ): Promise<IotToolCall> {
    const whereClause: Record<string, unknown> = {
      device_id: deviceId,
      farm: { id: farmId },
    };
    if (farmerId) {
      (whereClause['farm'] as Record<string, unknown>)['farmer'] = {
        id: farmerId,
      };
    }

    const device = await this.farmRepository.manager.findOne(IotDevice, {
      where: whereClause as any,
      relations: ['farm'],
    });
    if (!device) throw new BadRequestException('IoT device not found');
    if (!device.is_active)
      throw new BadRequestException('IoT device is not active');

    const toolCall = this.iotToolCallRepository.create({
      command_type: input.command_type as IotCommandType,
      parameters: input.parameters,
      status: IotToolCallStatus.PENDING,
      requested_by: farmerId ? 'user' : 'ai',
      iot_device: device,
    });
    const saved = await this.iotToolCallRepository.save(toolCall);

    const iotClient = this.buildIotClient();
    if (iotClient && device.thing_name && device.thing_arn) {
      const jobDocument = JSON.stringify({
        tool_call_id: saved.id,
        command_type: input.command_type,
        parameters: input.parameters ?? {},
        farm_id: farmId,
        device_id: deviceId,
      });
      console.log('jobDocument:', jobDocument);
      const response = await iotClient
        .createJob({
          jobId: saved.id,
          targets: [device.thing_arn],
          document: jobDocument,
          targetSelection: 'SNAPSHOT',
        })
        .promise();
      console.log('createJobResponse:', response);
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
    body: {
      tool_call_id: string;
      status: 'COMPLETED' | 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED';
      response?: Record<string, unknown>;
    },
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

    const mapped =
      body.status === 'SUCCEEDED' || body.status === 'COMPLETED'
        ? IotToolCallStatus.COMPLETED
        : body.status === 'IN_PROGRESS'
          ? IotToolCallStatus.IN_PROGRESS
          : IotToolCallStatus.FAILED;
    toolCall.status = mapped;
    if (body.response) toolCall.response = body.response;
    await this.iotToolCallRepository.save(toolCall);

    return Object.assign(toolCall, { farmId: toolCall.iot_device.farm.id });
  }

  async confirmIotDestination(confirmationToken: string): Promise<void> {
    const iotClient = this.buildIotClient();
    if (!iotClient) return;
    await iotClient
      .confirmTopicRuleDestination({ confirmationToken })
      .promise();
  }

  async setupIotRule(): Promise<void> {
    const iotClient = this.buildIotClient();
    if (!iotClient) return;

    const appBaseUrl = this.configService.get<string>('APP_BASE_URL');
    const webhookSecret = this.configService.get<string>('IOT_WEBHOOK_SECRET');
    if (!appBaseUrl) return;

    const ruleName = 'BeorchidIotJobUpdates';
    const webhookUrl = `${appBaseUrl}/api/iot/webhook`;
    const confirmUrl = `${appBaseUrl}/api/iot/webhook`;
    const headers: AWS.Iot.HttpActionHeader[] = webhookSecret
      ? [{ key: 'x-iot-secret', value: webhookSecret }]
      : [];

    // Force delete so AWS IoT retries the confirmation handshake
    try {
      await iotClient.deleteTopicRule({ ruleName }).promise();
      console.log('Deleted existing rule:', ruleName);
    } catch (_) {}

    try {
      await iotClient
        .createTopicRule({
          ruleName,
          topicRulePayload: {
            sql: "SELECT topic(5) AS tool_call_id, status, statusDetails AS response FROM '$aws/things/+/jobs/+/update'",
            actions: [
              {
                http: {
                  url: webhookUrl,
                  confirmationUrl: confirmUrl,
                  headers,
                },
              },
            ],
            awsIotSqlVersion: '2016-03-23',
            ruleDisabled: false,
          },
        })
        .promise();
    } catch (err: any) {
      if (err?.code === 'ResourceAlreadyExistsException') return;
      throw err;
    }

    console.log('IoT rule created:', ruleName);
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
