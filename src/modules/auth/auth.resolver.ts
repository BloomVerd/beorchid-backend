import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterInput } from './inputs/register.input';
import { ChangePasswordInput } from './inputs/change-password.input';
import { AuthPayload, MessageResponse } from './types/auth.types';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => AuthPayload)
  register(@Args('input') input: RegisterInput) {
    return this.authService.register(input);
  }

  @Mutation(() => MessageResponse)
  sendMagicLink(
    @Args('email') email: string,
    @Args('redirectBase', { nullable: true }) redirectBase?: string,
  ) {
    return this.authService.sendMagicLink(email, redirectBase);
  }

  @Mutation(() => AuthPayload)
  verifyMagicLink(@Args('token') token: string) {
    return this.authService.verifyMagicLink(token);
  }

  @Mutation(() => AuthPayload)
  loginWithPassword(
    @Args('email') email: string,
    @Args('password') password: string,
  ) {
    return this.authService.loginWithPassword(email, password);
  }

  @Mutation(() => AuthPayload)
  refresh(@Args('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Mutation(() => MessageResponse)
  @UseGuards(GqlJwtAuthGuard)
  logout(
    @Args('refreshToken') refreshToken: string,
    @CurrentFarmer() _farmer: Farmer,
  ) {
    return this.authService.logout(refreshToken);
  }

  @Mutation(() => MessageResponse)
  @UseGuards(GqlJwtAuthGuard)
  changePassword(
    @Args('input') input: ChangePasswordInput,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.authService.changePassword(farmer.id, input);
  }
}
