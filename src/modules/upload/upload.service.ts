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

/**
 * Generates pre-signed S3 URLs for direct client-side uploads to Cloudflare R2.
 *
 * Binary files are never routed through the API server — the client receives a
 * short-lived PUT URL and uploads directly to R2. The resulting object key is
 * then passed back to GraphQL mutations (e.g. `uploadFarmImages`) to persist
 * the metadata.
 *
 * `getPublicUrl(key)` constructs the CDN URL for publicly readable objects.
 * `getPresignedUrl(key)` generates a signed GET URL for private objects.
 *
 * Uses the AWS S3 SDK pointed at the Cloudflare R2 endpoint
 * (`S3_ENDPOINT`) with `region: "auto"`.
 */
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

  // ── Pre-signed upload URLs ───────────────────────────────────────────────

  /**
   * Generates a 300-second pre-signed PUT URL for uploading an image (`image/*`).
   * @returns `{ uploadUrl, key }` — the client PUTs to `uploadUrl`; store `key` for later reference.
   */
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

  /**
   * Generates a 300-second pre-signed PUT URL for uploading a PDF document (`application/pdf`).
   * @returns `{ uploadUrl, key }`
   */
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

  /**
   * Generates a 3600-second pre-signed PUT URL for uploading a video (`video/*`).
   * Longer expiry than images/documents to accommodate large file uploads.
   * @returns `{ uploadUrl, key }`
   */
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

  // ── File management ──────────────────────────────────────────────────────

  /** Deletes an object from the public R2 bucket by key. */
  async deleteFile(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
    });
    await this.s3.send(command);
    return { message: 'File deleted successfully' };
  }

  /**
   * Generates a signed GET URL for a private object. Defaults to 1-hour expiry.
   * Use for objects that should not be publicly accessible via the CDN.
   */
  async getPresignedUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.publicBucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /** Constructs the public CDN URL for a given object key. Normalises the base URL to always use `https://`. */
  getPublicUrl(key: string) {
    const cdn = this.cdnUrl.startsWith('http')
      ? this.cdnUrl
      : `https://${this.cdnUrl}`;
    return `${cdn}/${key}`;
  }
}
