import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Farmer } from './entities/farmer.entity';
import { FarmerService } from './farmer.service';
import { FarmerResolver } from './farmer.resolver';
import { JwtStrategy } from 'common/strategies';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Farmer]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: 86400 },
      }),
    }),
  ],
  providers: [FarmerService, FarmerResolver, JwtStrategy],
  exports: [FarmerService, TypeOrmModule],
})
export class FarmerModule {}
