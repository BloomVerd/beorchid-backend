import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from 'rxjs';
import { Notification, NotificationType } from './entities/notification.entity';
import { Farmer } from '../farmer/entities/farmer.entity';

interface CreateNotificationDto {
  title: string;
  message: string;
  type: NotificationType;
}

/**
 * Core service for notification persistence and SSE stream management.
 *
 * Each connected client gets an RxJS `Subject<Notification>` keyed by
 * `farmerId`. The SSE controller subscribes to this subject via
 * `getOrCreateSubject` and unsubscribes via `removeSubject` on disconnect.
 * `pushToStream` emits onto the subject if the farmer is currently connected;
 * if not connected the call is a no-op (the notification is still persisted in
 * the DB by the consumer).
 */
@Injectable()
export class NotificationsService {
  private readonly streams = new Map<string, Subject<Notification>>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /** Persists a new notification row for the given farmer. */
  async create(
    farmerId: string,
    dto: CreateNotificationDto,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      ...dto,
      farmer: { id: farmerId } as Farmer,
    });
    return this.notificationRepo.save(notification);
  }

  /**
   * Emits a notification onto the farmer's SSE subject. No-op if the farmer
   * has no active SSE connection.
   */
  pushToStream(farmerId: string, notification: Notification): void {
    const subject = this.streams.get(farmerId);
    if (subject) {
      subject.next(notification);
    }
  }

  /**
   * Returns the existing `Subject` for the farmer, or creates and registers a
   * new one. Called by the SSE controller when a client connects.
   */
  getOrCreateSubject(farmerId: string): Subject<Notification> {
    let subject = this.streams.get(farmerId);
    if (!subject) {
      subject = new Subject<Notification>();
      this.streams.set(farmerId, subject);
    }
    return subject;
  }

  /**
   * Removes the farmer's SSE subject from the in-memory map. Called by the
   * SSE controller's `finalize` operator when the client disconnects.
   */
  removeSubject(farmerId: string): void {
    this.streams.delete(farmerId);
  }

  /** Returns paginated notifications for a farmer, newest first. */
  async findByFarmer(
    farmerId: string,
    page = 1,
    limit = 20,
  ): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { farmer: { id: farmerId } },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /**
   * Marks a notification as read. Only the owning farmer's notifications are
   * accessible (the query filters on both `id` and `farmerId`).
   *
   * @throws NotFoundException if the notification does not exist or belongs to another farmer
   */
  async markRead(farmerId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, farmer: { id: farmerId } },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    notification.isRead = true;
    return this.notificationRepo.save(notification);
  }
}
