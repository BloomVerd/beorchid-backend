import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterInput } from './inputs/register.input';
import { ChangePasswordInput } from './inputs/change-password.input';
import { AuthPayload, MessageResponse } from './types/auth.types';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for authentication mutations. Most operations are public
 * (no guard); `logout` and `changePassword` require a valid JWT so the
 * current user's identity can be verified.
 */
@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  /** Creates a new account and returns an initial JWT + refresh token pair. */
  @Mutation(() => AuthPayload)
  register(@Args('input') input: RegisterInput) {
    return this.authService.register(input);
  }

  /** Emails a 15-minute magic-link sign-in URL to the given address. */
  @Mutation(() => MessageResponse)
  sendMagicLink(
    @Args('email') email: string,
    @Args('redirectBase', { nullable: true }) redirectBase?: string,
  ) {
    return this.authService.sendMagicLink(email, redirectBase);
  }

  /** Exchanges a raw magic-link token for a JWT + refresh token pair. */
  @Mutation(() => AuthPayload)
  verifyMagicLink(@Args('token') token: string) {
    return this.authService.verifyMagicLink(token);
  }

  /** Authenticates with email and password, returning a JWT + refresh token pair. */
  @Mutation(() => AuthPayload)
  loginWithPassword(
    @Args('email') email: string,
    @Args('password') password: string,
  ) {
    return this.authService.loginWithPassword(email, password);
  }

  /** Rotates a refresh token and issues a new JWT + refresh token pair. */
  @Mutation(() => AuthPayload)
  refresh(@Args('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  /** Invalidates the given refresh token. Requires a valid JWT. */
  @Mutation(() => MessageResponse)
  @UseGuards(GqlJwtAuthGuard)
  logout(
    @Args('refreshToken') refreshToken: string,
    @CurrentFarmer() _farmer: Farmer,
  ) {
    return this.authService.logout(refreshToken);
  }

  /** Verifies the current password then updates it to the new value. Requires a valid JWT. */
  @Mutation(() => MessageResponse)
  @UseGuards(GqlJwtAuthGuard)
  changePassword(
    @Args('input') input: ChangePasswordInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.authService.changePassword(farmer.id, input);
  }
}
