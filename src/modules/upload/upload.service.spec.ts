const mockGetSignedUrl = jest.fn().mockResolvedValue('https://presigned-url.example.com/key');
const mockS3Send = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation((input: any) => input),
  DeleteObjectCommand: jest.fn().mockImplementation((input: any) => input),
  GetObjectCommand: jest.fn().mockImplementation((input: any) => input),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          S3_REGION: 'us-east-1',
          S3_ENDPOINT: 'https://s3.example.com',
          S3_ACCESS_KEY_ID: 'test-access-key',
          S3_SECRET_ACCESS_KEY: 'test-secret-key',
          S3_BUCKET_PUBLIC: 'test-bucket',
          S3_CDN_URL: 'cdn.example.com',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getImageUploadUrl', () => {
    it('returns uploadUrl and key with images/ prefix by default', async () => {
      const result = await service.getImageUploadUrl();

      expect(result.key).toMatch(/^images\//);
      expect(result.uploadUrl).toBe('https://presigned-url.example.com/key');
    });

    it('uses a custom folder when provided', async () => {
      const result = await service.getImageUploadUrl('setup-photos');

      expect(result.key).toMatch(/^setup-photos\//);
    });

    it('creates PutObjectCommand with image/* ContentType and 300s expiry', async () => {
      await service.getImageUploadUrl();

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'image/*', Bucket: 'test-bucket' }),
      );
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });
  });

  describe('getDocumentUploadUrl', () => {
    it('returns uploadUrl and key with documents/ prefix by default', async () => {
      const result = await service.getDocumentUploadUrl();

      expect(result.key).toMatch(/^documents\//);
    });

    it('creates PutObjectCommand with application/pdf ContentType', async () => {
      await service.getDocumentUploadUrl();

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'application/pdf' }),
      );
    });
  });

  describe('getVideoUploadUrl', () => {
    it('returns uploadUrl and key with videos/ prefix by default', async () => {
      const result = await service.getVideoUploadUrl();

      expect(result.key).toMatch(/^videos\//);
    });

    it('creates PutObjectCommand with video/* ContentType and 3600s expiry', async () => {
      await service.getVideoUploadUrl();

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'video/*' }),
      );
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 },
      );
    });
  });

  describe('deleteFile', () => {
    it('calls S3 DeleteObjectCommand with correct key and returns success message', async () => {
      const result = await service.deleteFile('images/some-file.jpg');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'images/some-file.jpg',
      });
      expect(mockS3Send).toHaveBeenCalled();
      expect(result).toEqual({ message: 'File deleted successfully' });
    });
  });

  describe('getPresignedUrl', () => {
    it('returns a presigned URL with default 3600s expiry', async () => {
      const url = await service.getPresignedUrl('images/some-file.jpg');

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'images/some-file.jpg',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 },
      );
      expect(url).toBe('https://presigned-url.example.com/key');
    });

    it('passes custom expiresIn when provided', async () => {
      await service.getPresignedUrl('videos/some-video.mp4', 7200);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 },
      );
    });
  });

  describe('getPublicUrl', () => {
    it('prepends https:// when CDN URL does not have a protocol', () => {
      const url = service.getPublicUrl('images/photo.jpg');

      expect(url).toBe('https://cdn.example.com/images/photo.jpg');
    });

    it('does not double-prefix when CDN URL already starts with https://', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'S3_CDN_URL') return 'https://cdn.example.com';
        return 'mock-value';
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newService = module.get<UploadService>(UploadService);
      const url = newService.getPublicUrl('images/photo.jpg');

      expect(url).toBe('https://cdn.example.com/images/photo.jpg');
      expect(url).not.toContain('https://https://');
    });
  });
});
