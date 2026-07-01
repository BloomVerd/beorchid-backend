/**
 * Passport guard that activates the `google` OAuth 2.0 strategy.
 * Applied to the `/v1/auth/google` and `/v1/auth/google/callback` endpoints.
 */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
