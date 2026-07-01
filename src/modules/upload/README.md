# Upload Module

Generates pre-signed URLs that allow clients to upload files directly to Cloudflare R2
(via the AWS S3 SDK) without routing binary data through the API server. Also provides
a public CDN URL helper and a signed read URL generator.

## Architecture

```
Client (GraphQL query)
        │
UploadResolver.imageUploadUrl / documentUploadUrl / videoUploadUrl
        │
UploadService.getImageUploadUrl() / getDocumentUploadUrl() / getVideoUploadUrl()
        │
S3Client.getSignedUrl(PutObjectCommand, { expiresIn })
        │
Return { uploadUrl, key }
        │
Client PUT binary directly to R2 ──────────────────► Cloudflare R2
        │
Client passes `key` to uploadFarmImages / updateFarmPhoto mutations
```

## Pre-signed URL expiry

| Method                 | Expiry  | Content-Type        |
|------------------------|---------|---------------------|
| `getImageUploadUrl`    | 300 s   | `image/*`           |
| `getDocumentUploadUrl` | 300 s   | `application/pdf`   |
| `getVideoUploadUrl`    | 3600 s  | `video/*`           |

## GraphQL API

All operations require JWT authentication (`@UseGuards(GqlJwtAuthGuard)` at the class level).

| Operation           | Type     | Description                                                 |
|---------------------|----------|-------------------------------------------------------------|
| `imageUploadUrl`    | Query    | Returns a pre-signed PUT URL and object key for an image    |
| `documentUploadUrl` | Query    | Returns a pre-signed PUT URL and object key for a PDF       |
| `videoUploadUrl`    | Query    | Returns a pre-signed PUT URL and object key for a video     |
| `deleteFile`        | Mutation | Deletes an object from R2 by key                            |

### Response type

```graphql
type PresignedUploadUrl {
  uploadUrl: String!   # Pre-signed PUT URL; client uploads directly to this
  key: String!         # R2 object key; pass back via uploadFarmImages etc.
}
```

## Public URL

`UploadService.getPublicUrl(key)` returns a CDN URL (`S3_CDN_URL/key`) for objects in
the public bucket. The CDN prefix is normalised to always include `https://`.

## Environment variables

| Variable             | Purpose                                              |
|----------------------|------------------------------------------------------|
| `S3_REGION`          | R2 region (use `auto` for Cloudflare R2)             |
| `S3_ENDPOINT`        | Cloudflare R2 bucket endpoint URL                    |
| `S3_ACCESS_KEY_ID`   | R2 access key                                        |
| `S3_SECRET_ACCESS_KEY` | R2 secret key                                      |
| `S3_BUCKET_PUBLIC`   | Name of the public R2 bucket                         |
| `S3_CDN_URL`         | CDN base URL for public file access                  |
