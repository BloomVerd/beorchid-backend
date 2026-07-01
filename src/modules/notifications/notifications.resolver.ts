import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';

/**
 * GraphQL resolver for notification read operations. All queries and mutations
 * require a valid JWT and are scoped to the authenticated farmer.
 *
 * Note: notification creation is not exposed here — it is handled internally
 * via `NotificationsProducer` and the `notifications` BullMQ queue.
 */
@Resolver(() => Notification)
export class NotificationsResolver {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Returns paginated notifications for the authenticated farmer, newest first. */
  @Query(() => [Notification])
  @UseGuards(GqlJwtAuthGuard)
  getMyNotifications(
    @CurrentFarmer() farmer: Farmer,
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 })
    page: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 20 })
    limit: number,
  ): Promise<Notification[]> {
    return this.notificationsService.findByFarmer(farmer.id, page, limit);
  }

  /** Marks a single notification as read. Only the owning farmer can mark their own notifications. */
  @Mutation(() => Notification)
  @UseGuards(GqlJwtAuthGuard)
  markNotificationRead(
    @CurrentFarmer() farmer: Farmer,
    @Args('notificationId') notificationId: string,
  ): Promise<Notification> {
    return this.notificationsService.markRead(farmer.id, notificationId);
  }
}
