import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FarmService } from './farm.service';
import { IotPubSubService } from './iot-pubsub.service';

/**
 * REST controller for IoT-specific endpoints that require raw HTTP semantics
 * (SSE streams, binary file downloads, and webhook callbacks from AWS IoT Rules).
 *
 * The SSE stream and download endpoints accept a JWT via the `?token=` query
 * parameter because browsers cannot set `Authorization` headers on native
 * `EventSource` or `<a download>` requests.
 */
@Controller('api')
export class IotController {
  constructor(
    private readonly farmService: FarmService,
    private readonly pubSub: IotPubSubService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Opens an SSE stream for real-time IoT tool-call status updates for a farm.
   * Validates the JWT from `?token=` and forwards Redis pub/sub events until
   * the client disconnects or `AbortSignal` fires.
   */
  @Get('farm/:farmId/iot/stream')
  async streamIotDevices(
    @Param('farmId') farmId: string,
    @Query('token') token: string,
    @Req() req: any,
    @Res() res: any,
  ): Promise<void> {
    try {
      this.jwtService.verify(token);
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      for await (const rawEvent of this.pubSub.subscribe(
        farmId,
        abortController.signal,
      )) {
        if (abortController.signal.aborted) break;
        res.write(`data: ${rawEvent}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  /**
   * Streams the IoT device credential bundle as a ZIP download.
   * Validates the JWT from `?token=` to identify the farmer before delegating
   * to `FarmService.downloadIotDevicePackage()`.
   */
  @Get('farm/:farmId/iot/:deviceId/download')
  async downloadIotDevicePackage(
    @Param('farmId') farmId: string,
    @Param('deviceId') deviceId: string,
    @Query('token') token: string,
    @Res() res: any,
  ): Promise<void> {
    let farmerId: string;
    try {
      const payload = this.jwtService.verify(token) as { id: string };
      farmerId = payload.id;
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    try {
      const { buffer, filename } =
        await this.farmService.downloadIotDevicePackage(
          farmerId,
          farmId,
          deviceId,
        );
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Length', buffer.length);
      res.status(200).send(buffer);
    } catch (err) {
      console.log('IOT download error:', err);
      if ((err as any)?.status === 400) {
        res.status(400).json({ message: (err as Error).message });
        return;
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  /**
   * AWS IoT Rule HTTP destination confirmation handshake. AWS sends a GET with
   * `?confirmationToken=…`; we must echo back the token to confirm ownership.
   */
  @Get('iot/webhook')
  @HttpCode(200)
  async confirmIotDestination(
    @Query('confirmationToken') confirmationToken: string,
    @Res() res: any,
  ): Promise<void> {
    console.log('IOT_CONFIRM_TOKEN:', confirmationToken);
    if (!confirmationToken) {
      res.status(400).send('Missing confirmationToken');
      return;
    }
    res.status(200).send(confirmationToken);
  }

  /**
   * Receives job-status payloads forwarded by the AWS IoT Rule HTTP action.
   * Updates the `IotToolCall` record and publishes the result to the Redis
   * SSE channel so connected clients see the status change in real time.
   */
  @Post('iot/webhook')
  async handleWebhook(
    @Headers('x-iot-secret') secret: string,
    @Body()
    body: {
      tool_call_id: string;
      status: 'COMPLETED' | 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED';
      response?: Record<string, unknown>;
    },
    @Res() res: any,
  ): Promise<void> {
    console.log(Date.now(), 'IOT_WEBHOOK_DATA:', body, secret);
    let updated: Awaited<ReturnType<typeof this.farmService.handleIotWebhook>>;
    try {
      updated = await this.farmService.handleIotWebhook(body, secret);
    } catch (err) {
      console.log('IOT_WEBHOOK_ERR', err);
      if (err instanceof UnauthorizedException) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      res.status(400).json({ message: (err as Error).message });
      return;
    }

    await this.pubSub.publish(updated.farmId, {
      type: 'tool_call_update',
      farmId: updated.farmId,
      toolCallId: updated.id,
      status: updated.status,
      response: updated.response,
    });

    res.status(200).json({ ok: true });
  }
}
