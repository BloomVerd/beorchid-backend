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

@Injectable()
export class NotificationsService {
  private readonly streams = new Map<string, Subject<Notification>>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

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

  pushToStream(farmerId: string, notification: Notification): void {
    const subject = this.streams.get(farmerId);
    if (subject) {
      subject.next(notification);
    }
  }

  getOrCreateSubject(farmerId: string): Subject<Notification> {
    let subject = this.streams.get(farmerId);
    if (!subject) {
      subject = new Subject<Notification>();
      this.streams.set(farmerId, subject);
    }
    return subject;
  }

  removeSubject(farmerId: string): void {
    this.streams.delete(farmerId);
  }

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
