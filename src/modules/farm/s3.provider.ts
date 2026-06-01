import { Injectable, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@Injectable()
export class S3Provider {
  private s3: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.s3 = new S3Client({
      region: configService.get<string>('S3_REGION') ?? 'auto',
      endpoint: configService.get<string>('S3_ENDPOINT'),
      credentials: {
        accessKeyId: configService.get<string>('S3_ACCESS_KEY_ID') ?? '',
        secretAccessKey:
          configService.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
      },
    });
    this.bucket = configService.get<string>('S3_BUCKET_PUBLIC') ?? '';
  }

  async fileupload(file: Express.Multer.File): Promise<string> {
    const key = this.generateFileName(file);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      await this.s3.send(command);
      return key;
    } catch (error) {
      throw new RequestTimeoutException(error);
    }
  }

  private generateFileName(file: Express.Multer.File): string {
    const name = file.originalname.split('.')[0].replace(/\s/g, '').trim();
    const extension = path.extname(file.originalname);
    const timestamp = Date.now().toString();
    return `${name}-${timestamp}-${uuidv4()}${extension}`;
  }
}
