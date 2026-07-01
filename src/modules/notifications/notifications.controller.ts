import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { NotificationsService } from './notifications.service';

/**
 * REST controller for Server-Sent Events (SSE) notification streaming.
 * Mounted at `GET /notifications/stream`.
 *
 * EventSource does not support custom HTTP headers, so the JWT is passed as a
 * query parameter (`?token=<jwt>`) instead of an Authorization header. The
 * token is verified synchronously before the SSE stream is opened.
 *
 * On client connect: creates (or reuses) an RxJS `Subject` for the farmer and
 * pipes it to the SSE response as `MessageEvent` objects.
 * On client disconnect: the RxJS `finalize` operator removes the `Subject`
 * from the in-memory map, cleaning up resources.
 *
 * A companion `GET /notifications/:id/read` endpoint allows marking a
 * notification as read via the same token-in-query-param pattern, so it can
 * be called from plain `fetch` calls alongside an EventSource.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * SSE endpoint. EventSource does not support custom headers, so the JWT is
   * passed as a query param: GET /notifications/stream?token=<jwt>
   */
  @Sse('stream')
  stream(@Query('token') token: string): Observable<MessageEvent> {
    let farmerId: string;
    try {
      const payload = this.jwtService.verify<{ id: string }>(token);
      farmerId = payload.id;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const subject = this.notificationsService.getOrCreateSubject(farmerId);

    return subject.asObservable().pipe(
      map((notification) => ({ data: notification }) as MessageEvent),
      finalize(() => this.notificationsService.removeSubject(farmerId)),
    );
  }

  /** Marks a notification as read. Token is passed as a query param for consistency with the SSE endpoint. */
  @Get(':id/read')
  async markRead(
    @Query('token') token: string,
    @Param('id') notificationId: string,
  ) {
    let farmerId: string;
    try {
      const payload = this.jwtService.verify<{ id: string }>(token);
      farmerId = payload.id;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    return this.notificationsService.markRead(farmerId, notificationId);
  }
}
