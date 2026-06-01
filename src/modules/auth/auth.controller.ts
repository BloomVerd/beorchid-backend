import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthService } from './auth.service';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleLogin() {}

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
