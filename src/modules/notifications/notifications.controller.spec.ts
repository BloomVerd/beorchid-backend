import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Subject } from 'rxjs';
import { firstValueFrom, take, toArray } from 'rxjs/operators';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';

const makeNotification = (): Notification =>
  ({
    id: 'notif-1',
    title: 'Test',
    message: 'msg',
    type: NotificationType.PREDICTION_ALERT,
    isRead: false,
    createdAt: new Date(),
  }) as Notification;

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: {
    getOrCreateSubject: jest.Mock;
    removeSubject: jest.Mock;
    markRead: jest.Mock;
  };
  let jwtService: { verify: jest.Mock };

  beforeEach(async () => {
    notificationsService = {
      getOrCreateSubject: jest.fn(),
      removeSubject: jest.fn(),
      markRead: jest.fn(),
    };
    jwtService = {
      verify: jest.fn().mockReturnValue({ id: 'farmer-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notificationsService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('stream', () => {
    it('returns an Observable that emits MessageEvent for each notification', (done) => {
      const subject = new Subject<Notification>();
      notificationsService.getOrCreateSubject.mockReturnValue(subject);

      const obs = controller.stream('valid-token');
      const notification = makeNotification();

      obs.subscribe({
        next: (event) => {
          expect(event.data).toBe(notification);
          done();
        },
      });

      subject.next(notification);
    });

    it('calls getOrCreateSubject with the farmerId from the JWT payload', () => {
      const subject = new Subject<Notification>();
      notificationsService.getOrCreateSubject.mockReturnValue(subject);
      jwtService.verify.mockReturnValue({ id: 'farmer-42' });

      controller.stream('token');

      expect(notificationsService.getOrCreateSubject).toHaveBeenCalledWith('farmer-42');
    });

    it('throws UnauthorizedException when the JWT is invalid', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      expect(() => controller.stream('bad-token')).toThrow(UnauthorizedException);
    });
  });

  describe('markRead', () => {
    it('delegates to notificationsService.markRead with farmerId and notificationId', async () => {
      const notification = makeNotification();
      notificationsService.markRead.mockResolvedValue(notification);

      const result = await controller.markRead('valid-token', 'notif-1');

      expect(notificationsService.markRead).toHaveBeenCalledWith('farmer-1', 'notif-1');
      expect(result).toBe(notification);
    });

    it('throws UnauthorizedException when the JWT is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(controller.markRead('expired-token', 'notif-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
