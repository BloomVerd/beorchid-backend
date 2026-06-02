import { ConfigService } from '@nestjs/config';

export const defaultRedisDBConnection = async (
  configService: ConfigService,
) => ({
  connection: {
    url: configService.get<string>('REDIS_URL'),
  },
});
