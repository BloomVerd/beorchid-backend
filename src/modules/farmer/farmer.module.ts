import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Farmer } from './entities/farmer.entity';
import { FarmerSettings } from './entities/farmer-settings.entity';
import { FarmerService } from './farmer.service';
import { FarmerResolver } from './farmer.resolver';
import { FarmerSettingsService } from './farmer-settings.service';
import { FarmerSettingsResolver } from './farmer-settings.resolver';
import { JwtStrategy } from 'src/common/strategies';

/**
 * Core identity module. Owns `Farmer` accounts and `FarmerSettings`. Exports
 * `FarmerService`, `FarmerSettingsService`, and `TypeOrmModule` (with both
 * repositories) so other modules can access farmer data without re-registering
 * the entities or creating circular imports.
 *
 * Registers `JwtModule` for token signing and `JwtStrategy` for JWT validation
 * so both are available to any module that imports `FarmerModule`.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Farmer, FarmerSettings]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: 86400 },
      }),
    }),
  ],
  providers: [
    FarmerService,
    FarmerResolver,
    FarmerSettingsService,
    FarmerSettingsResolver,
    JwtStrategy,
  ],
  exports: [FarmerService, FarmerSettingsService, TypeOrmModule],
})
export class FarmerModule {}
