import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';

const makeNotification = (overrides: Partial<Notification> = {}): Notification =>
  ({
    id: 'notif-1',
    title: 'Prediction results for Farm A',
    message: '1 high-risk prediction(s) detected.',
    type: NotificationType.PREDICTION_ALERT,
    isRead: false,
    createdAt: new Date(),
    farmer: { id: 'farmer-1' } as any,
    ...overrides,
  }) as Notification;

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve({ ...d, id: 'notif-1' })),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: repo },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('persists a new notification and returns it', async () => {
      const dto = {
        title: 'Test',
        message: 'msg',
        type: NotificationType.PREDICTION_ALERT,
      };

      const result = await service.create('farmer-1', dto);

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        farmer: { id: 'farmer-1' },
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toMatchObject(dto);
    });

    it('does not push to an SSE stream on its own', async () => {
      const subject = new Subject<Notification>();
      const nextSpy = jest.spyOn(subject, 'next');
      service.getOrCreateSubject('farmer-1');
      // getOrCreateSubject creates the subject internally — replace it so we can spy
      (service as any).streams.set('farmer-1', subject);

      await service.create('farmer-1', {
        title: 'T',
        message: 'M',
        type: NotificationType.PREDICTION_ALERT,
      });

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe('pushToStream', () => {
    it('emits the notification to the farmer subject when connected', () => {
      const subject = new Subject<Notification>();
      const received: Notification[] = [];
      subject.subscribe((n) => received.push(n));
      (service as any).streams.set('farmer-1', subject);

      const notification = makeNotification();
      service.pushToStream('farmer-1', notification);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(notification);
    });

    it('is a no-op when the farmer has no active SSE connection', () => {
      expect(() =>
        service.pushToStream('no-such-farmer', makeNotification()),
      ).not.toThrow();
    });
  });

  describe('getOrCreateSubject / removeSubject', () => {
    it('returns the same subject on repeated calls', () => {
      const s1 = service.getOrCreateSubject('farmer-1');
      const s2 = service.getOrCreateSubject('farmer-1');
      expect(s1).toBe(s2);
    });

    it('removes the subject so pushToStream becomes a no-op', () => {
      const subject = service.getOrCreateSubject('farmer-1');
      const nextSpy = jest.spyOn(subject, 'next');

      service.removeSubject('farmer-1');
      service.pushToStream('farmer-1', makeNotification());

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe('findByFarmer', () => {
    it('queries by farmer id with default pagination', async () => {
      const notifications = [makeNotification()];
      repo.find.mockResolvedValue(notifications);

      const result = await service.findByFarmer('farmer-1');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { farmer: { id: 'farmer-1' } },
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toBe(notifications);
    });

    it('applies page/limit offsets correctly', async () => {
      repo.find.mockResolvedValue([]);

      await service.findByFarmer('farmer-1', 3, 10);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('markRead', () => {
    it('sets isRead to true and saves', async () => {
      const notification = makeNotification({ isRead: false });
      repo.findOne.mockResolvedValue(notification);
      repo.save.mockImplementation((n) => Promise.resolve(n));

      const result = await service.markRead('farmer-1', 'notif-1');

      expect(result.isRead).toBe(true);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: true }),
      );
    });

    it('throws NotFoundException when notification does not belong to farmer', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.markRead('farmer-1', 'wrong-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
