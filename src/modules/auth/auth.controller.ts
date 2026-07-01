import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthService } from './auth.service';

/**
 * REST controller for the Google OAuth 2.0 flow.
 *
 * The GraphQL transport cannot handle redirects, so these two endpoints are
 * exposed as plain HTTP routes. After a successful OAuth callback the user is
 * redirected to `FRONTEND_URL/auth/callback` with `accessToken` and
 * `refreshToken` as query parameters.
 */
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /** Redirects the browser to the Google OAuth consent screen. */
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleLogin() {}

  /**
   * Google OAuth callback. Upserts the farmer from the Google profile, issues
   * tokens, and redirects to `FRONTEND_URL/auth/callback?accessToken=…&refreshToken=…`.
   */
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  // @ts-expect-error express types
  async googleCallback(@Req() req, @Res() res) {
    const { email, firstName, lastName, googleId } = req.user;
    const { accessToken, refreshToken } = await this.authService.handleGoogleLogin({
      email,
      firstName,
      lastName,
      googleId,
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    return res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`,
    );
  }
}
