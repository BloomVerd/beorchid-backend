import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ObjectType, Field } from '@nestjs/graphql';
import { GqlJwtAuthGuard } from 'common/guards';
import { UploadService } from './upload.service';

@ObjectType()
export class PresignedUploadUrl {
  @Field()
  uploadUrl: string;

  @Field()
  key: string;
}

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class UploadResolver {
  constructor(private readonly uploadService: UploadService) {}

  @Query(() => PresignedUploadUrl)
  async imageUploadUrl(
    @Args('folder', { nullable: true, defaultValue: 'images' }) folder: string,
  ): Promise<PresignedUploadUrl> {
    return this.uploadService.getImageUploadUrl(folder);
  }

  @Query(() => PresignedUploadUrl)
  async documentUploadUrl(
    @Args('folder', { nullable: true, defaultValue: 'documents' })
    folder: string,
  ): Promise<PresignedUploadUrl> {
    return this.uploadService.getDocumentUploadUrl(folder);
  }

  @Query(() => PresignedUploadUrl)
  async videoUploadUrl(
    @Args('folder', { nullable: true, defaultValue: 'videos' }) folder: string,
  ): Promise<PresignedUploadUrl> {
    return this.uploadService.getVideoUploadUrl(folder);
  }

  @Mutation(() => String)
  async deleteFile(@Args('key') key: string): Promise<string> {
    const result = await this.uploadService.deleteFile(key);
    return result.message;
  }
}
