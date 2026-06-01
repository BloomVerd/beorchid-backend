import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private s3: S3Client;
  private publicBucket: string;
  private cdnUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('S3_REGION') ?? 'auto',
      endpoint: this.configService.get<string>('S3_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('S3_SECRET_ACCESS_KEY')!,
      },
    });
    this.publicBucket = this.configService.get<string>('S3_BUCKET_PUBLIC')!;
    this.cdnUrl = this.configService.get<string>('S3_CDN_URL')!;
  }

  async getImageUploadUrl(folder = 'images') {
    const key = `${folder}/${uuidv4()}`;
    const command = new PutObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
      ContentType: 'image/*',
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    return { uploadUrl, key };
  }

  async getDocumentUploadUrl(folder = 'documents') {
    const key = `${folder}/${uuidv4()}`;
    const command = new PutObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
      ContentType: 'application/pdf',
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    return { uploadUrl, key };
  }

  async getVideoUploadUrl(folder = 'videos') {
    const key = `${folder}/${uuidv4()}`;
    const command = new PutObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
      ContentType: 'video/*',
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 });
    return { uploadUrl, key };
  }

  async deleteFile(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
    });
    await this.s3.send(command);
    return { message: 'File deleted successfully' };
  }

  async getPresignedUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  getPublicUrl(key: string) {
    const cdn = this.cdnUrl.startsWith('http')
      ? this.cdnUrl
      : `https://${this.cdnUrl}`;
    return `${cdn}/${key}`;
  }
}
