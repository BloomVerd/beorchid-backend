import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ROLES_KEY } from './roles.decorator';

/**
 * NestJS guard that enforces role-based access on GraphQL resolvers.
 *
 * Reads the `roles` metadata set by the `@Roles()` decorator and checks
 * whether the authenticated user possesses at least one of the required roles.
 * Roles are read from `user.roles`, which may be either an array of strings or
 * a comma-separated string (both formats are handled).
 *
 * When no `@Roles()` metadata is present the guard passes through, allowing
 * `@UseGuards(GqlJwtAuthGuard, RolesGuard)` at the class level without
 * requiring every method to carry a `@Roles()` decorator.
 *
 * Usage:
 * ```typescript
 * @UseGuards(GqlJwtAuthGuard, RolesGuard)
 * @Roles('super_admin')
 * someAdminMutation() { ... }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const ctx = GqlExecutionContext.create(context);
    const user = ctx.getContext().req?.user;
    if (!user) return false;

    const userRoles: string[] = Array.isArray(user.roles)
      ? user.roles
      : (user.roles ?? '').split(',').map((r: string) => r.trim());

    return required.some((role) => userRoles.includes(role));
  }
}
