import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { Farmer } from '../farmer/entities/farmer.entity';

const makeFarmer = (): Farmer => ({ id: 'farmer-1' } as Farmer);

const makeNotification = (overrides: Partial<Notification> = {}): Notification =>
  ({
    id: 'notif-1',
    title: 'Prediction results for Farm A',
    message: '1 high-risk prediction(s) detected.',
    type: NotificationType.PREDICTION_ALERT,
    isRead: false,
    createdAt: new Date(),
    ...overrides,
  }) as Notification;

describe('NotificationsResolver', () => {
  let resolver: NotificationsResolver;
  let service: { findByFarmer: jest.Mock; markRead: jest.Mock };

  beforeEach(async () => {
    service = {
      findByFarmer: jest.fn(),
      markRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsResolver,
        { provide: NotificationsService, useValue: service },
      ],
    }).compile();

    resolver = module.get<NotificationsResolver>(NotificationsResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getMyNotifications', () => {
    it('delegates to service.findByFarmer with farmer id and pagination', async () => {
      const notifications = [makeNotification()];
      service.findByFarmer.mockResolvedValue(notifications);

      const result = await resolver.getMyNotifications(makeFarmer(), 2, 10);

      expect(service.findByFarmer).toHaveBeenCalledWith('farmer-1', 2, 10);
      expect(result).toBe(notifications);
    });
  });

  describe('markNotificationRead', () => {
    it('delegates to service.markRead and returns updated notification', async () => {
      const updated = makeNotification({ isRead: true });
      service.markRead.mockResolvedValue(updated);

      const result = await resolver.markNotificationRead(makeFarmer(), 'notif-1');

      expect(service.markRead).toHaveBeenCalledWith('farmer-1', 'notif-1');
      expect(result.isRead).toBe(true);
    });
  });
});
