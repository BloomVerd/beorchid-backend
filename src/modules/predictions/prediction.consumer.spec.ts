import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PredictionConsumer } from './prediction.consumer';
import { Prediction, RiskLevel } from './entities/prediction.entity';
import { PredictionType } from '../farm/entities/image-data.entity';
import { CropType } from '../farm/entities/farm.entity';
import { FarmerSettingsService } from '../farmer/farmer-settings.service';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { NotificationType } from '../notifications/entities/notification.entity';
import { EmailProducer } from '../email/email.producer';
import { SmsService } from '../sms/sms.service';

const makeJob = (data: object, name = 'create-predictions') => ({ name, data });

const makeFarm = (overrides: any = {}) => ({
  id: 'farm-1',
  name: 'Test Farm',
  crop_type: CropType.MAIZE,
  soil_type: 'loam',
  growth_stage: null,
  farm_size: 10,
  lat: null,
  lon: null,
  crop_density: null,
  elevation_m: 0,
  days_to_maturity: null,
  farm_images: [],
  farmer: { id: 'farmer-1', email: 'farmer@example.com', firstName: 'John' },
  ...overrides,
});

const makeImage = (predType: PredictionType = PredictionType.DISEASE_PREDICTION) => ({
  id: `img-${Math.random()}`,
  url: 'https://cdn.example.com/img.jpg',
  lat: 5.0,
  lon: -1.0,
  prediction_types: [predType],
});

const makeApiResponse = (overrides: any = {}) => ({
  subplots: [
    {
      latitude: 5.0,
      longitude: -1.0,
      disease: { predicted_class: 'leaf_blight', severity: 0.7, confidence: 0.9 },
      yield: { water_stress_pct: 0.2 },
      ...overrides,
    },
  ],
});

const makeSettings = (overrides: any = {}) => ({
  notifyInApp: true,
  notifyEmail: false,
  notifySms: false,
  smsPhoneNumber: null,
  ...overrides,
});

describe('PredictionConsumer', () => {
  let consumer: PredictionConsumer;
  let predictionRepo: {
    manager: { findOne: jest.Mock };
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let farmerSettingsService: { getOrCreate: jest.Mock };
  let notificationsProducer: { notify: jest.Mock };
  let emailProducer: { sendPredictionAlert: jest.Mock };
  let smsService: { sendPredictionAlert: jest.Mock };

  beforeEach(async () => {
    predictionRepo = {
      manager: { findOne: jest.fn() },
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue([]),
    };
    farmerSettingsService = {
      getOrCreate: jest.fn().mockResolvedValue(makeSettings()),
    };
    notificationsProducer = { notify: jest.fn().mockResolvedValue(undefined) };
    emailProducer = { sendPredictionAlert: jest.fn().mockResolvedValue(undefined) };
    smsService = { sendPredictionAlert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionConsumer,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:8000') } },
        { provide: getRepositoryToken(Prediction), useValue: predictionRepo },
        { provide: FarmerSettingsService, useValue: farmerSettingsService },
        { provide: NotificationsProducer, useValue: notificationsProducer },
        { provide: EmailProducer, useValue: emailProducer },
        { provide: SmsService, useValue: smsService },
      ],
    }).compile();

    consumer = module.get<PredictionConsumer>(PredictionConsumer);

    // Stub the HTTP call to the prediction API
    jest.spyOn(consumer as any, 'callPredictionApi').mockResolvedValue(makeApiResponse());
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('ignores jobs with an unrecognised name', async () => {
      await consumer.process(makeJob({ farmId: 'farm-1' }, 'other-job') as any);

      expect(predictionRepo.manager.findOne).not.toHaveBeenCalled();
    });

    it('skips gracefully when farm is not found', async () => {
      predictionRepo.manager.findOne.mockResolvedValue(null);

      await consumer.process(makeJob({ farmId: 'missing' }) as any);

      expect(predictionRepo.save).not.toHaveBeenCalled();
      expect(notificationsProducer.notify).not.toHaveBeenCalled();
    });

    it('skips when farm has no images with prediction types', async () => {
      const farm = makeFarm({ farm_images: [{ ...makeImage(), prediction_types: [] }] });
      predictionRepo.manager.findOne
        .mockResolvedValueOnce(farm)   // Farm
        .mockResolvedValueOnce(null);  // PredictionRange

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(predictionRepo.save).not.toHaveBeenCalled();
      expect(notificationsProducer.notify).not.toHaveBeenCalled();
    });
  });

  describe('notification dispatch', () => {
    const setupFarmWithImage = (predType = PredictionType.DISEASE_PREDICTION) => {
      const farm = makeFarm({ farm_images: [makeImage(predType)] });
      predictionRepo.manager.findOne
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(null);
      return farm;
    };

    it('always queues a notification job after saving predictions', async () => {
      setupFarmWithImage();

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(notificationsProducer.notify).toHaveBeenCalledWith(
        'farmer-1',
        expect.objectContaining({
          type: NotificationType.PREDICTION_ALERT,
          title: 'Prediction results for Test Farm',
        }),
        expect.any(Boolean),
      );
    });

    it('passes notifyInApp=true to notify when notifyInApp is true', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(makeSettings({ notifyInApp: true }));
      setupFarmWithImage();

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(notificationsProducer.notify).toHaveBeenCalledWith(
        'farmer-1',
        expect.any(Object),
        true,
      );
    });

    it('passes notifyInApp=false to notify when notifyInApp is false', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(makeSettings({ notifyInApp: false }));
      setupFarmWithImage();

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(notificationsProducer.notify).toHaveBeenCalledWith(
        'farmer-1',
        expect.any(Object),
        false,
      );
    });

    it('queues email when notifyEmail is true', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(makeSettings({ notifyEmail: true }));
      setupFarmWithImage();

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(emailProducer.sendPredictionAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'farmer@example.com',
          firstName: 'John',
          farmName: 'Test Farm',
        }),
      );
    });

    it('does not queue email when notifyEmail is false', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(makeSettings({ notifyEmail: false }));
      setupFarmWithImage();

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(emailProducer.sendPredictionAlert).not.toHaveBeenCalled();
    });

    it('sends SMS when notifySms is true and smsPhoneNumber is set', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(
        makeSettings({ notifySms: true, smsPhoneNumber: '+233200000000' }),
      );
      setupFarmWithImage();

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(smsService.sendPredictionAlert).toHaveBeenCalledWith(
        '+233200000000',
        'Test Farm',
        expect.any(String),
      );
    });

    it('does not send SMS when notifySms is true but smsPhoneNumber is missing', async () => {
      farmerSettingsService.getOrCreate.mockResolvedValue(
        makeSettings({ notifySms: true, smsPhoneNumber: null }),
      );
      setupFarmWithImage();

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(smsService.sendPredictionAlert).not.toHaveBeenCalled();
    });

    it('does not dispatch any channel notifications when farm has no farmer', async () => {
      const farm = makeFarm({ farm_images: [makeImage()], farmer: null });
      predictionRepo.manager.findOne
        .mockResolvedValueOnce(farm)
        .mockResolvedValueOnce(null);

      await consumer.process(makeJob({ farmId: 'farm-1' }) as any);

      expect(notificationsProducer.notify).not.toHaveBeenCalled();
    });
  });

  describe('buildSummary', () => {
    it('returns low risk message when all predictions are low risk', () => {
      const records = [
        { risk_level: RiskLevel.LOW } as Prediction,
        { risk_level: RiskLevel.LOW } as Prediction,
      ];
      const summary = (consumer as any).buildSummary(records);
      expect(summary).toBe('All predictions look good — low risk detected.');
    });

    it('lists high and moderate counts separately', () => {
      const records = [
        { risk_level: RiskLevel.HIGH } as Prediction,
        { risk_level: RiskLevel.HIGH } as Prediction,
        { risk_level: RiskLevel.MODERATE } as Prediction,
      ];
      const summary = (consumer as any).buildSummary(records);
      expect(summary).toBe('2 high-risk, 1 moderate-risk prediction(s) detected.');
    });

    it('lists only high when no moderate risk exists', () => {
      const records = [{ risk_level: RiskLevel.HIGH } as Prediction];
      const summary = (consumer as any).buildSummary(records);
      expect(summary).toBe('1 high-risk prediction(s) detected.');
    });
  });
});
