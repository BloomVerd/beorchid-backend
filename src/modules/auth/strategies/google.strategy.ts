import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
// @ts-expect-error no types
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

/**
 * Passport strategy for Google OAuth 2.0 (`passport-google-oauth20`).
 * Reads `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET`, and `GOOGLE_CALLBACK_URL` from
 * the environment. On successful authentication it normalises the Google profile
 * into a plain object (`email`, `firstName`, `lastName`, `googleId`) which is
 * attached to `req.user` for the callback controller to consume.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  /** Extracts email, name, and Google ID from the OAuth profile and passes them to `done`. */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    done(null, {
      email: profile.emails[0].value,
      firstName: profile.name?.givenName ?? '',
      lastName: profile.name?.familyName ?? '',
      googleId: profile.id,
    });
  }
}
