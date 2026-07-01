import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadResolver } from './upload.resolver';

/**
 * Provides pre-signed URL generation for client-side direct uploads to
 * Cloudflare R2. Exports `UploadService` so other modules can generate
 * public CDN URLs or signed read URLs without re-declaring the S3 client.
 */
@Module({
  providers: [UploadService, UploadResolver],
  exports: [UploadService],
})
export class UploadModule {}
