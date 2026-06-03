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
