import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const defaultPostgresDBConnection = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  autoLoadEntities: true,
  synchronize: false,
  url: configService.get('DATABASE_URL'),
  ssl: { rejectUnauthorized: false },
  migrations: [join(__dirname, '..', '..', 'database', 'migrations', '*.{ts,js}')],
  migrationsRun: true,
  migrationsTableName: 'migrations',
});
