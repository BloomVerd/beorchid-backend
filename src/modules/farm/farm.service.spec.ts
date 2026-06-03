const makeIotPromise = (val: any) => ({ promise: jest.fn().mockResolvedValue(val) });

const mockIotInstance = {
  createThing: jest.fn().mockReturnValue(makeIotPromise({})),
  createKeysAndCertificate: jest.fn().mockReturnValue(
    makeIotPromise({
      certificateId: 'cert-id',
      certificateArn: 'cert-arn',
      certificatePem: 'cert-pem',
      keyPair: { PrivateKey: 'private-key', PublicKey: 'public-key' },
    }),
  ),
  attachThingPrincipal: jest.fn().mockReturnValue(makeIotPromise({})),
  detachThingPrincipal: jest.fn().mockReturnValue(makeIotPromise({})),
  updateCertificate: jest.fn().mockReturnValue(makeIotPromise({})),
  deleteCertificate: jest.fn().mockReturnValue(makeIotPromise({})),
  deleteThing: jest.fn().mockReturnValue(makeIotPromise({})),
};

const mockIotDataInstance = {
  publish: jest.fn().mockReturnValue(makeIotPromise({})),
};

jest.mock('aws-sdk', () => ({
  Iot: jest.fn().mockImplementation(() => mockIotInstance),
  IotData: jest.fn().mockImplementation(() => mockIotDataInstance),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { FarmService } from './farm.service';
import { Farm, SetupStatus, CropType, FarmType } from './entities/farm.entity';
import { ImageData, PredictionType } from './entities/image-data.entity';
import { IotDevice, DeviceType } from './entities/iot-device.entity';
import { IotToolCall, IotCommandType, IotToolCallStatus } from './entities/iot-tool-call.entity';
import { Farmer } from '../farmer/entities/farmer.entity';
import { Coordinate } from './entities/coordinate.entity';
import { PredictionRange } from '../predictions/entities/prediction-range.entity';

const makeFarmer = (overrides: Partial<Farmer> = {}): Farmer =>
  ({ id: 'farmer-id-1', email: 'farmer@example.com', firstName: 'John', ...overrides }) as Farmer;

const makeFarm = (overrides: Partial<Farm> = {}): Farm =>
  ({
    id: 'farm-id-1',
    name: 'Test Farm',
    crop_type: CropType.MAIZE,
    variety: 'Hybrid',
    farm_size: 5.0,
    farm_type: FarmType.FIELD,
    setup_status: SetupStatus.PENDING,
    coordinates: [],
    farm_images: [],
    iot_devices: [],
    farmer: makeFarmer(),
    ...overrides,
  }) as Farm;

const makeDevice = (overrides: Partial<IotDevice> = {}): IotDevice =>
  ({
    id: 'device-id-1',
    device_id: 'device-uuid-1',
    label: 'Soil Sensor',
    device_type: DeviceType.SOIL_MOISTURE_SENSOR,
    is_active: false,
    thing_name: 'farm_farm-id-1_device-uuid-1',
    certificate_id: 'cert-id',
    certificate_arn: 'cert-arn',
    certificate_pem: 'cert-pem',
    private_key: 'private-key',
    public_key: 'public-key',
    farm: { id: 'farm-id-1' } as any,
    ...overrides,
  }) as IotDevice;

const makeToolCall = (overrides: Partial<IotToolCall> = {}): IotToolCall =>
  ({
    id: 'tc-id-1',
    command_type: IotCommandType.IRRIGATE,
    parameters: { duration_minutes: 30 },
    status: IotToolCallStatus.PENDING,
    response: undefined,
    requested_by: 'user',
    iot_device: makeDevice({ is_active: true }),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as IotToolCall;

describe('FarmService', () => {
  let service: FarmService;
  let farmRepo: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    manager: { transaction: jest.Mock; findOne: jest.Mock };
  };
  let imageRepo: { findAndCount: jest.Mock };
  let iotToolCallRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockQb: {
    leftJoinAndSelect: jest.Mock;
    leftJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let mockEm: {
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    mockEm = {
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
    };

    mockQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    farmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockEm)),
        findOne: jest.fn(),
      },
    };

    imageRepo = { findAndCount: jest.fn() };

    iotToolCallRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (entity) => ({ id: 'tc-id-1', ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          IOT_REGION: 'us-east-1',
          IOT_ACCESS_KEY_ID: 'iot-access-key',
          IOT_SECRET_ACCESS_KEY: 'iot-secret-key',
          IOT_DATA_ENDPOINT: 'https://xxx-ats.iot.us-east-1.amazonaws.com',
          IOT_WEBHOOK_SECRET: 'test-webhook-secret',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmService,
        { provide: getRepositoryToken(Farm), useValue: farmRepo },
        { provide: getRepositoryToken(ImageData), useValue: imageRepo },
        { provide: getRepositoryToken(IotToolCall), useValue: iotToolCallRepo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<FarmService>(FarmService);

    // Reset IoT mock call counts between tests
    Object.values(mockIotInstance).forEach((fn) => (fn as jest.Mock).mockClear());
    Object.values(mockIotDataInstance).forEach((fn) => (fn as jest.Mock).mockClear());
  });

  afterEach(() => jest.clearAllMocks());

  describe('addFarm', () => {
    const input = { name: 'My Farm', crop_type: CropType.MAIZE, variety: 'Hybrid', farm_size: 5.0, farm_type: FarmType.FIELD };

    it('creates and returns a new farm', async () => {
      const farmer = makeFarmer();
      const farm = makeFarm();
      mockEm.findOne.mockResolvedValue(farmer);
      mockEm.count.mockResolvedValue(3);
      mockEm.create.mockReturnValue(farm);
      mockEm.save.mockResolvedValue(farm);

      const result = await service.addFarm('farmer-id-1', input);

      expect(result).toBe(farm);
      expect(mockEm.create).toHaveBeenCalledWith(Farm, expect.objectContaining({ name: input.name }));
    });

    it('throws BadRequestException when farmer is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(service.addFarm('nonexistent-farmer', input)).rejects.toThrow(
        new BadRequestException('Farmer not found'),
      );
    });

    it('throws BadRequestException when farmer already has 10 farms', async () => {
      mockEm.findOne.mockResolvedValue(makeFarmer());
      mockEm.count.mockResolvedValue(10);

      await expect(service.addFarm('farmer-id-1', input)).rejects.toThrow(
        new BadRequestException('Farmers cannot create more than 10 farms'),
      );
    });
  });

  describe('listFarms', () => {
    it('returns paginated farms', async () => {
      const farms = [makeFarm(), makeFarm({ id: 'farm-id-2' })];
      farmRepo.findAndCount.mockResolvedValue([farms, 2]);

      const result = await service.listFarms('farmer-id-1', 1, 10);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
    });

    it('computes lastPage correctly', async () => {
      farmRepo.findAndCount.mockResolvedValue([[], 15]);

      const result = await service.listFarms('farmer-id-1', 2, 5);

      expect(result.lastPage).toBe(3);
    });
  });

  describe('getFarm', () => {
    it('returns the farm when found', async () => {
      const farm = makeFarm();
      farmRepo.findOne.mockResolvedValue(farm);

      const result = await service.getFarm('farmer-id-1', 'farm-id-1');

      expect(result).toBe(farm);
      expect(farmRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ relations: ['coordinates', 'farm_images', 'iot_devices'] }),
      );
    });

    it('throws BadRequestException when farm is not found', async () => {
      farmRepo.findOne.mockResolvedValue(null);

      await expect(service.getFarm('farmer-id-1', 'missing-farm')).rejects.toThrow(
        new BadRequestException('Farm not found'),
      );
    });
  });

  describe('updateFarmCoordinates', () => {
    const input = { coordinates: [{ order: 1, lat: 5.0, lon: -1.0 }] };

    it('transitions PENDING status to IN_PROGRESS and saves coordinates', async () => {
      const farm = makeFarm({ setup_status: SetupStatus.PENDING });
      const reloadedFarm = makeFarm({ setup_status: SetupStatus.IN_PROGRESS });
      mockEm.findOne
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(reloadedFarm);
      mockEm.delete.mockResolvedValue({});
      mockEm.create.mockReturnValue({});
      mockEm.save.mockResolvedValue(farm);

      const result = await service.updateFarmCoordinates('farmer-id-1', 'farm-id-1', input);

      expect(mockEm.delete).toHaveBeenCalledWith(Coordinate, { farm: { id: 'farm-id-1' } });
      expect(result).toBe(reloadedFarm);
    });

    it('throws BadRequestException when farm is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.updateFarmCoordinates('farmer-id-1', 'missing-farm', input),
      ).rejects.toThrow(new BadRequestException('Farm not found'));
    });
  });

  describe('updateFarmPhoto', () => {
    const input = { url: 'https://cdn.example.com/photo.jpg', lat: 5.0, lon: -1.0 };

    it('updates photo fields and transitions status if PENDING', async () => {
      const farm = makeFarm({ setup_status: SetupStatus.PENDING });
      mockEm.findOne.mockResolvedValue(farm);
      mockEm.save.mockImplementation((f: any) => Promise.resolve(f));

      const result = await service.updateFarmPhoto('farmer-id-1', 'farm-id-1', input);

      expect(result.setup_photo_url).toBe(input.url);
      expect(result.setup_status).toBe(SetupStatus.IN_PROGRESS);
    });

    it('throws BadRequestException when farm is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.updateFarmPhoto('farmer-id-1', 'missing-farm', input),
      ).rejects.toThrow(new BadRequestException('Farm not found'));
    });
  });

  describe('updateFarmSoilData', () => {
    const input = { soil_type: 'LOAM' as any, crop_density: 50, iot_device_ids: ['dev-1'] };

    it('updates soil data fields', async () => {
      const farm = makeFarm({ setup_status: SetupStatus.IN_PROGRESS });
      mockEm.findOne.mockResolvedValue(farm);
      mockEm.save.mockImplementation((f: any) => Promise.resolve(f));

      const result = await service.updateFarmSoilData('farmer-id-1', 'farm-id-1', input);

      expect(result.soil_type).toBe(input.soil_type);
      expect(result.crop_density).toBe(50);
    });

    it('throws BadRequestException when farm is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.updateFarmSoilData('farmer-id-1', 'missing-farm', input),
      ).rejects.toThrow(new BadRequestException('Farm not found'));
    });
  });

  describe('completeSetup', () => {
    it('sets setup_status to COMPLETE', async () => {
      const farm = makeFarm({ setup_status: SetupStatus.IN_PROGRESS });
      mockEm.findOne.mockResolvedValue(farm);
      mockEm.save.mockImplementation((f: any) => Promise.resolve(f));

      const result = await service.completeSetup('farmer-id-1', 'farm-id-1');

      expect(result.setup_status).toBe(SetupStatus.COMPLETE);
    });

    it('throws BadRequestException when farm is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(service.completeSetup('farmer-id-1', 'missing-farm')).rejects.toThrow(
        new BadRequestException('Farm not found'),
      );
    });
  });

  describe('uploadFarmImages', () => {
    const baseInput = {
      images: [{ url: 'https://cdn.example.com/img.jpg', lat: 5.0, lon: -1.0, predictionTypes: [PredictionType.DISEASE_PREDICTION] }],
    };

    it('saves images with explicit predictionRangeId', async () => {
      const farm = makeFarm();
      const range: Partial<PredictionRange> = { id: 'range-id-1', farm: farm as any };
      const savedImages = [{ id: 'img-1' }];
      mockEm.findOne
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(range);
      mockEm.create.mockReturnValue({ id: 'img-1' });
      mockEm.save.mockResolvedValue(savedImages);

      const result = await service.uploadFarmImages('farmer-id-1', 'farm-id-1', {
        ...baseInput,
        predictionRangeId: 'range-id-1',
      } as any);

      expect(result).toBe(savedImages);
    });

    it('auto-creates a prediction range when none is provided', async () => {
      const farm = makeFarm();
      const newRange = { id: 'new-range', farm };
      mockEm.findOne
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(null); // no existing range for this week
      mockEm.create.mockReturnValueOnce(newRange).mockReturnValue({ id: 'img-1' });
      mockEm.save
        .mockResolvedValueOnce(newRange)
        .mockResolvedValueOnce([{ id: 'img-1' }]);

      await service.uploadFarmImages('farmer-id-1', 'farm-id-1', baseInput as any);

      expect(mockEm.save).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when farm is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.uploadFarmImages('farmer-id-1', 'missing-farm', baseInput as any),
      ).rejects.toThrow(new BadRequestException('Farm not found'));
    });

    it('throws BadRequestException when explicit predictionRangeId is not found', async () => {
      mockEm.findOne
        .mockResolvedValueOnce(makeFarm())
        .mockResolvedValueOnce(null);

      await expect(
        service.uploadFarmImages('farmer-id-1', 'farm-id-1', {
          ...baseInput,
          predictionRangeId: 'invalid-range',
        } as any),
      ).rejects.toThrow(new BadRequestException('Prediction range not found for this farm'));
    });
  });

  describe('registerIotDevice', () => {
    const input = { label: 'Soil Sensor', device_type: DeviceType.SOIL_MOISTURE_SENSOR };

    it('creates a device with AWS IoT credentials', async () => {
      const farm = makeFarm();
      const device = makeDevice();
      mockEm.findOne.mockResolvedValue(farm);
      mockEm.create.mockReturnValue(device);
      mockEm.save.mockResolvedValue(device);

      const result = await service.registerIotDevice('farmer-id-1', 'farm-id-1', input as any);

      expect(mockIotInstance.createThing).toHaveBeenCalled();
      expect(mockIotInstance.createKeysAndCertificate).toHaveBeenCalled();
      expect(mockIotInstance.attachThingPrincipal).toHaveBeenCalled();
      expect(result.certificate_id).toBeDefined();
    });

    it('throws BadRequestException when farm is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.registerIotDevice('farmer-id-1', 'missing-farm', input as any),
      ).rejects.toThrow(new BadRequestException('Farm not found'));
    });
  });

  describe('deleteIotDevice', () => {
    it('cleans up AWS resources and removes device', async () => {
      const device = makeDevice();
      mockEm.findOne.mockResolvedValue(device);
      mockEm.remove.mockResolvedValue({});

      const result = await service.deleteIotDevice('farmer-id-1', 'farm-id-1', 'device-id-1');

      expect(mockIotInstance.detachThingPrincipal).toHaveBeenCalled();
      expect(mockIotInstance.deleteThing).toHaveBeenCalled();
      expect(mockEm.remove).toHaveBeenCalledWith(device);
      expect(result).toBe(true);
    });

    it('throws BadRequestException when device is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.deleteIotDevice('farmer-id-1', 'farm-id-1', 'missing-device'),
      ).rejects.toThrow(new BadRequestException('IoT device not found'));
    });
  });

  describe('activateIotDevice', () => {
    it('activates the device and updates AWS certificate status', async () => {
      const device = makeDevice({ is_active: false });
      mockEm.findOne.mockResolvedValue(device);
      mockEm.save.mockImplementation((d: any) => Promise.resolve(d));

      const result = await service.activateIotDevice('farmer-id-1', 'farm-id-1', 'device-id-1');

      expect(mockIotInstance.updateCertificate).toHaveBeenCalledWith(
        expect.objectContaining({ newStatus: 'ACTIVE' }),
      );
      expect(result.is_active).toBe(true);
    });

    it('throws BadRequestException when device is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.activateIotDevice('farmer-id-1', 'farm-id-1', 'missing-device'),
      ).rejects.toThrow(new BadRequestException('IoT device not found'));
    });
  });

  describe('clearIotDeviceCert', () => {
    it('clears certificate fields from device and returns true', async () => {
      const device = makeDevice();
      mockEm.findOne.mockResolvedValue(device);
      mockEm.save.mockResolvedValue(device);

      const result = await service.clearIotDeviceCert('farmer-id-1', 'farm-id-1', 'device-id-1');

      expect(device.certificate_pem).toBeUndefined();
      expect(device.private_key).toBeUndefined();
      expect(device.public_key).toBeUndefined();
      expect(result).toBe(true);
    });

    it('throws BadRequestException when device is not found', async () => {
      mockEm.findOne.mockResolvedValue(null);

      await expect(
        service.clearIotDeviceCert('farmer-id-1', 'farm-id-1', 'missing-device'),
      ).rejects.toThrow(new BadRequestException('IoT device not found'));
    });
  });

  describe('listFarmImages', () => {
    it('throws BadRequestException when farm is not found', async () => {
      farmRepo.findOne.mockResolvedValue(null);

      await expect(
        service.listFarmImages('farmer-id-1', 'missing-farm', 1, 10),
      ).rejects.toThrow(new BadRequestException('Farm not found'));
    });

    it('returns paginated images without date filter', async () => {
      farmRepo.findOne.mockResolvedValue(makeFarm());
      imageRepo.findAndCount.mockResolvedValue([[{ id: 'img-1' }], 1]);

      const result = await service.listFarmImages('farmer-id-1', 'farm-id-1', 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.lastPage).toBe(1);
    });

    it('returns lastPage of 1 when there are no images', async () => {
      farmRepo.findOne.mockResolvedValue(makeFarm());
      imageRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listFarmImages('farmer-id-1', 'farm-id-1', 1, 10);

      expect(result.lastPage).toBe(1);
    });

    it('applies year/month/week filter via Between', async () => {
      farmRepo.findOne.mockResolvedValue(makeFarm());
      imageRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.listFarmImages('farmer-id-1', 'farm-id-1', 1, 10, 2025, 6, 2);

      const callArgs = imageRepo.findAndCount.mock.calls[0][0];
      expect(callArgs.where.createdAt).toBeDefined();
    });

    it('uses last day of month for week 4 boundary', async () => {
      farmRepo.findOne.mockResolvedValue(makeFarm());
      imageRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.listFarmImages('farmer-id-1', 'farm-id-1', 1, 10, 2025, 2, 4);

      const callArgs = imageRepo.findAndCount.mock.calls[0][0];
      const between = callArgs.where.createdAt;
      // For week 4 of Feb 2025: end date should be last day of Feb (28th)
      expect(between._value[1].getDate()).toBe(28);
    });
  });

  describe('triggerIotDevice', () => {
    const input = { command_type: IotCommandType.IRRIGATE, parameters: { duration_minutes: 30 } };
    const activeDevice = makeDevice({ is_active: true });

    it('creates a PENDING tool call and publishes to AWS IoT', async () => {
      farmRepo.manager.findOne.mockResolvedValue(activeDevice);
      const saved = makeToolCall();
      iotToolCallRepo.save.mockResolvedValue(saved);

      const result = await service.triggerIotDevice('farmer-id-1', 'farm-id-1', 'device-id-1', input);

      expect(iotToolCallRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          command_type: IotCommandType.IRRIGATE,
          status: IotToolCallStatus.PENDING,
          requested_by: 'user',
        }),
      );
      expect(mockIotDataInstance.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: `farm/farm-id-1/devices/${activeDevice.thing_name}/commands`,
        }),
      );
      expect(result).toBe(saved);
    });

    it('sets requested_by to "ai" when farmerId is null', async () => {
      farmRepo.manager.findOne.mockResolvedValue(activeDevice);
      iotToolCallRepo.save.mockResolvedValue(makeToolCall({ requested_by: 'ai' }));

      await service.triggerIotDevice(null, 'farm-id-1', 'device-id-1', input);

      expect(iotToolCallRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ requested_by: 'ai' }),
      );
    });

    it('skips MQTT publish when IotData client is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'IOT_DATA_ENDPOINT') return undefined;
        const config: Record<string, string> = {
          IOT_REGION: 'us-east-1',
          IOT_ACCESS_KEY_ID: 'key',
          IOT_SECRET_ACCESS_KEY: 'secret',
        };
        return config[key];
      });
      farmRepo.manager.findOne.mockResolvedValue(activeDevice);
      iotToolCallRepo.save.mockResolvedValue(makeToolCall());

      await service.triggerIotDevice('farmer-id-1', 'farm-id-1', 'device-id-1', input);

      expect(mockIotDataInstance.publish).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when device is not found', async () => {
      farmRepo.manager.findOne.mockResolvedValue(null);

      await expect(
        service.triggerIotDevice('farmer-id-1', 'farm-id-1', 'missing-device', input),
      ).rejects.toThrow(new BadRequestException('IoT device not found'));
    });

    it('throws BadRequestException when device is not active', async () => {
      farmRepo.manager.findOne.mockResolvedValue(makeDevice({ is_active: false }));

      await expect(
        service.triggerIotDevice('farmer-id-1', 'farm-id-1', 'device-id-1', input),
      ).rejects.toThrow(new BadRequestException('IoT device is not active'));
    });
  });

  describe('listIotToolCalls', () => {
    it('returns paginated tool calls scoped to 24h window', async () => {
      const toolCalls = [makeToolCall(), makeToolCall({ id: 'tc-id-2' })];
      mockQb.getManyAndCount.mockResolvedValue([toolCalls, 2]);

      const result = await service.listIotToolCalls('farmer-id-1', 'farm-id-1', 1, 10);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
    });

    it('applies the 24h window filter via andWhere', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listIotToolCalls('farmer-id-1', 'farm-id-1', 1, 10);

      const andWhereCalls = mockQb.andWhere.mock.calls.map((c: any[]) => c[0]);
      expect(andWhereCalls).toContain('tc.createdAt >= :since');
    });

    it('passes farmId and farmerId to the query', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.listIotToolCalls('farmer-id-1', 'farm-id-1', 1, 10);

      expect(mockQb.where).toHaveBeenCalledWith('farm.id = :farmId', { farmId: 'farm-id-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('farmer.id = :farmerId', { farmerId: 'farmer-id-1' });
    });

    it('computes lastPage correctly', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 15]);

      const result = await service.listIotToolCalls('farmer-id-1', 'farm-id-1', 2, 5);

      expect(result.lastPage).toBe(3);
    });
  });

  describe('handleIotWebhook', () => {
    it('updates tool call to COMPLETED with response and returns farmId', async () => {
      const toolCall = makeToolCall({
        iot_device: makeDevice({ farm: { id: 'farm-id-1' } as any }),
      });
      iotToolCallRepo.findOne.mockResolvedValue(toolCall);
      iotToolCallRepo.save.mockImplementation(async (tc: any) => tc);

      const result = await service.handleIotWebhook(
        { tool_call_id: 'tc-id-1', status: 'COMPLETED', response: { liters: 10 } },
        'test-webhook-secret',
      );

      expect(result.status).toBe(IotToolCallStatus.COMPLETED);
      expect(result.response).toEqual({ liters: 10 });
      expect(result.farmId).toBe('farm-id-1');
    });

    it('updates tool call to FAILED', async () => {
      const toolCall = makeToolCall({
        iot_device: makeDevice({ farm: { id: 'farm-id-1' } as any }),
      });
      iotToolCallRepo.findOne.mockResolvedValue(toolCall);
      iotToolCallRepo.save.mockImplementation(async (tc: any) => tc);

      const result = await service.handleIotWebhook(
        { tool_call_id: 'tc-id-1', status: 'FAILED' },
        'test-webhook-secret',
      );

      expect(result.status).toBe(IotToolCallStatus.FAILED);
    });

    it('throws UnauthorizedException when secret is wrong', async () => {
      await expect(
        service.handleIotWebhook(
          { tool_call_id: 'tc-id-1', status: 'COMPLETED' },
          'wrong-secret',
        ),
      ).rejects.toThrow('Invalid webhook secret');
    });

    it('throws BadRequestException when tool call is not found', async () => {
      iotToolCallRepo.findOne.mockResolvedValue(null);

      await expect(
        service.handleIotWebhook(
          { tool_call_id: 'missing-id', status: 'COMPLETED' },
          'test-webhook-secret',
        ),
      ).rejects.toThrow(new BadRequestException('IoT tool call not found'));
    });

    it('skips secret check when IOT_WEBHOOK_SECRET is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'IOT_WEBHOOK_SECRET') return undefined;
        return 'some-value';
      });
      const toolCall = makeToolCall({
        iot_device: makeDevice({ farm: { id: 'farm-id-1' } as any }),
      });
      iotToolCallRepo.findOne.mockResolvedValue(toolCall);
      iotToolCallRepo.save.mockImplementation(async (tc: any) => tc);

      const result = await service.handleIotWebhook(
        { tool_call_id: 'tc-id-1', status: 'COMPLETED' },
        'any-secret-or-empty',
      );

      expect(result.status).toBe(IotToolCallStatus.COMPLETED);
    });
  });
});
