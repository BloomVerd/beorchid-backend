import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * NestJS guard that restricts a resolver to credentialed field agents.
 *
 * Passes when `req.user.isFieldAgent === true`. Field agent capability is
 * granted by a `super_admin` via `grantFieldAgentCapability` and revoked
 * via `revokeFieldAgentCapability`. The flag is stored on the `Farmer` entity
 * and embedded in the JWT payload.
 *
 * Must be used alongside `GqlJwtAuthGuard` to ensure `req.user` is populated:
 * ```typescript
 * @UseGuards(GqlJwtAuthGuard)
 * @UseGuards(FieldAgentGuard)
 * submitFieldObservation() { ... }
 * ```
 */
@Injectable()
export class FieldAgentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = GqlExecutionContext.create(context);
    const user = ctx.getContext().req?.user;
    return !!user?.isFieldAgent;
  }
}
