import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { createDatabase } from 'common/lib/create-db';
import { graphqlUploadExpress } from 'graphql-upload';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  // Create main database
  await createDatabase(process.env.DB_NAME!);

  // Create test database
  await createDatabase(process.env.DB_NAME_TEST!);

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT') || 4000;

  app.useGlobalPipes(new ValidationPipe());

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.use(
    '/graphql',
    graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 10 }),
  );

  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
void bootstrap();
