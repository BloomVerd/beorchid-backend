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
