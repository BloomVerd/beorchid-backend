# Roles Module

NestJS guards and decorators for role-based and capability-based access control on GraphQL resolvers.

---

## Components

### `@Roles(...roles)` decorator

Sets metadata on a resolver method or class indicating which roles are required. Read by `RolesGuard` at runtime.

```typescript
@Roles('super_admin', 'farmer')
@UseGuards(GqlJwtAuthGuard, RolesGuard)
someResolver() { ... }
```

### `RolesGuard`

Reads the `roles` metadata and checks whether the authenticated user's role list includes at least one of the required roles. Passes through (allows) when no `@Roles` metadata is present — this allows applying `@UseGuards(GqlJwtAuthGuard, RolesGuard)` at the class level without requiring every method to carry a `@Roles` decorator.

**Role format:** `user.roles` may be either a `string[]` or a comma-separated string; both formats are handled.

### `FieldAgentGuard`

A separate guard that checks `req.user.isFieldAgent === true`. Designed for field observation endpoints where the check is a boolean capability flag rather than a named role.

Must be combined with `GqlJwtAuthGuard` to ensure `req.user` is populated first.

---

## Usage patterns

### Class-level admin lockdown

```typescript
@Resolver()
@UseGuards(GqlJwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminResolver { ... }
```

### Method-level role override

```typescript
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class MyResolver {
  @Query(() => [Item])
  publicQuery() { ... }           // no role required

  @Mutation(() => Item)
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  adminMutation() { ... }         // super_admin only
}
```

### Field agent capability

```typescript
@Mutation(() => FieldObservation)
@UseGuards(GqlJwtAuthGuard)
@UseGuards(FieldAgentGuard)
submitObservation() { ... }
```

---

## Role values in use

| Role | Assigned to |
|------|-------------|
| `farmer` | Farm owners (default account type) |
| `individual` | Individual investor accounts |
| `company` | Corporate investor accounts |
| `super_admin` | Platform administrators |

---

## Exports

```typescript
export { Roles, ROLES_KEY } from './roles.decorator';
export { RolesGuard } from './roles.guard';
export { FieldAgentGuard } from './field-agent.guard';
```

These are re-exported from `src/modules/roles/index.ts` for convenient single-import usage across the codebase.
