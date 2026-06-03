import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const createDynamoDBClient = (
  configService: ConfigService,
): DynamoDBDocumentClient => {
  const client = new DynamoDBClient({
    region: configService.get<string>('DYNAMODB_REGION') ?? 'us-east-1',
    credentials: {
      accessKeyId: configService.get<string>('DYNAMODB_ACCESS_KEY_ID') ?? '',
      secretAccessKey:
        configService.get<string>('DYNAMODB_SECRET_ACCESS_KEY') ?? '',
    },
  });

  return DynamoDBDocumentClient.from(client);
};
