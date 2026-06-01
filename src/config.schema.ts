import * as Joi from '@hapi/joi';

export const configValidationSchema = Joi.object({
  STAGE: Joi.string().required(),
  PORT: Joi.number().default(4000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  DB_USERNAME: Joi.string().required(),
  DB_HOST: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  JWT_SECRET: Joi.string().required(),

  // Frontend
  FRONTEND_URL: Joi.string().required(),

  // Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().optional(),

  // Email
  GMAIL_USER: Joi.string().optional(),
  GMAIL_APP_PASSWORD: Joi.string().optional(),
  EMAIL_FROM: Joi.string().required(),
  EMAIL_HOST: Joi.string().optional(),

  // AWS IoT Core
  IOT_REGION: Joi.string().optional(),
  IOT_ACCESS_KEY_ID: Joi.string().optional(),
  IOT_SECRET_ACCESS_KEY: Joi.string().optional(),

  // Cloudflare R2 (S3-compatible)
  S3_REGION: Joi.string().optional(),
  S3_ENDPOINT: Joi.string().optional(),
  S3_ACCESS_KEY_ID: Joi.string().optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().optional(),
  S3_BUCKET_PUBLIC: Joi.string().optional(),
  S3_BUCKET_PRIVATE: Joi.string().optional(),
  S3_CDN_URL: Joi.string().optional(),
});
