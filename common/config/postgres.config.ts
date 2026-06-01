import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const defaultPostgresDBConnection = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  autoLoadEntities: true,
  synchronize: configService.get('NODE_ENV') !== 'production',
  url: configService.get('DATABASE_URL'),
  ssl: {
    rejectUnauthorized: false, // allow self-signed AWS certs
  },
});
