import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { configValidationSchema } from './config.schema';
import { defaultPostgresDBConnection } from 'src/common/config/postgres.config';
import { defaultRedisDBConnection } from 'src/common/config/redis.config';
import { AuthModule } from './modules/auth/auth.module';
import { FarmerModule } from './modules/farmer/farmer.module';
import { FarmModule } from './modules/farm/farm.module';
import { PredictionModule } from './modules/predictions/prediction.module';
import { EmailModule } from './modules/email/email.module';
import { UploadModule } from './modules/upload/upload.module';
import { HealthModule } from './modules/health/health.module';
import { ChatModule } from './modules/chat/chat.module';
import { FarmDataModule } from './modules/farm-data/farm-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        process.env.STAGE === 'development'
          ? `.env.${process.env.STAGE}.local`
          : '.env',
      ],
      validationSchema: configValidationSchema,
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      introspection: true,
      playground: true,
      context: ({ req }: { req: any }) => ({ req }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: defaultPostgresDBConnection,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: defaultRedisDBConnection,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    FarmerModule,
    FarmModule,
    PredictionModule,
    EmailModule,
    UploadModule,
    HealthModule,
    ChatModule,
    FarmDataModule,
  ],
})
export class AppModule {}
