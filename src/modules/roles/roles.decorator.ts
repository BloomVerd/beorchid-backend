import { SetMetadata } from '@nestjs/common';

/** Metadata key used by `RolesGuard` to read required roles from handler/class metadata. */
export const ROLES_KEY = 'roles';

/**
 * Decorator that attaches required role names to a resolver method or class.
 * Read by `RolesGuard` to enforce role-based access control.
 *
 * @example
 * ```typescript
 * @Roles('super_admin')
 * @UseGuards(GqlJwtAuthGuard, RolesGuard)
 * adminMutation() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
