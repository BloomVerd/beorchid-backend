import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ObjectType, Field } from '@nestjs/graphql';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { UploadService } from './upload.service';

/** GraphQL return type for pre-signed upload operations. The client PUTs to `uploadUrl`; `key` is stored for later reference. */
@ObjectType()
export class PresignedUploadUrl {
  @Field()
  uploadUrl: string;

  @Field()
  key: string;
}

/**
 * GraphQL resolver for client-side direct uploads to Cloudflare R2.
 *
 * All operations are JWT-protected at the class level. The flow is:
 * 1. Client queries one of the `*UploadUrl` queries to get a pre-signed PUT URL and key.
 * 2. Client PUTs the file binary directly to R2 (no server proxy).
 * 3. Client passes the returned `key` to a domain mutation (e.g. `uploadFarmImages`).
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class UploadResolver {
  constructor(private readonly uploadService: UploadService) {}

  /** Returns a 300-second pre-signed PUT URL for uploading an image to R2. */
  @Query(() => PresignedUploadUrl)
  async imageUploadUrl(
    @Args('folder', { nullable: true, defaultValue: 'images' }) folder: string,
  ): Promise<PresignedUploadUrl> {
    return this.uploadService.getImageUploadUrl(folder);
  }

  /** Returns a 300-second pre-signed PUT URL for uploading a PDF document to R2. */
  @Query(() => PresignedUploadUrl)
  async documentUploadUrl(
    @Args('folder', { nullable: true, defaultValue: 'documents' })
    folder: string,
  ): Promise<PresignedUploadUrl> {
    return this.uploadService.getDocumentUploadUrl(folder);
  }

  /** Returns a 3600-second pre-signed PUT URL for uploading a video to R2. */
  @Query(() => PresignedUploadUrl)
  async videoUploadUrl(
    @Args('folder', { nullable: true, defaultValue: 'videos' }) folder: string,
  ): Promise<PresignedUploadUrl> {
    return this.uploadService.getVideoUploadUrl(folder);
  }

  /** Deletes an object from R2 by key and returns a confirmation message. */
  @Mutation(() => String)
  async deleteFile(@Args('key') key: string): Promise<string> {
    const result = await this.uploadService.deleteFile(key);
    return result.message;
  }
}
