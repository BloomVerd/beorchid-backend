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

@Controller('api')
export class IotController {
  constructor(
    private readonly farmService: FarmService,
    private readonly pubSub: IotPubSubService,
    private readonly jwtService: JwtService,
  ) {}

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
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${filename}`,
      );
      res.setHeader('Content-Length', buffer.length);
      res.status(200).send(buffer);
    } catch (err) {
      if ((err as any)?.status === 400) {
        res.status(400).json({ message: (err as Error).message });
        return;
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  @Get('iot/webhook')
  @HttpCode(200)
  async confirmIotDestination(
    @Query('confirmationToken') confirmationToken: string,
    @Res() res: any,
  ): Promise<void> {
    try {
      await this.farmService.confirmIotDestination(confirmationToken);
      res.status(200).json({ ok: true });
    } catch {
      res.status(500).json({ message: 'Confirmation failed' });
    }
  }

  @Post('iot/webhook')
  async handleWebhook(
    @Headers('x-iot-secret') secret: string,
    @Body() body: { tool_call_id: string; status: 'COMPLETED' | 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED'; response?: Record<string, unknown> },
    @Res() res: any,
  ): Promise<void> {
    let updated: Awaited<ReturnType<typeof this.farmService.handleIotWebhook>>;
    try {
      updated = await this.farmService.handleIotWebhook(body, secret);
    } catch (err) {
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
