# Audit Module

A lightweight write-only logging module that records actor-initiated actions against named entities. Other modules inject `AuditService` to persist structured audit trail entries; the entries are then queryable by super-admins via the `auditLog` query in the Admin module.

---

## Entity

| Entity | Table | Purpose |
|--------|-------|---------|
| `AuditLog` | `audit_logs` | Immutable record of a state-changing action |

### AuditLog fields

| Field | Type | Description |
|-------|------|-------------|
| `actorId` | `string` | ID of the user who performed the action |
| `action` | `string` | Verb describing what happened (e.g. `"UPDATE_ROLES"`, `"SUSPEND"`) |
| `entity` | `string` | Name of the entity type affected (e.g. `"Farmer"`, `"Listing"`) |
| `entityId` | `string` | Primary key of the affected record |
| `diff` | `jsonb \| null` | Optional before/after snapshot or change payload |
| `createdAt` | `timestamp` | When the action was logged |

---

## Usage

`AuditModule` exports `AuditService`. Import the module and inject the service wherever an audit trail is needed:

```ts
// In another module:
imports: [AuditModule],

// In a service:
constructor(private readonly auditService: AuditService) {}

await this.auditService.log(
  actorId,
  'UPDATE_ROLES',
  'Farmer',
  targetUserId,
  { before: oldRoles, after: newRoles },
);
```

---

## GraphQL Access

`AuditLog` records are exposed read-only via the Admin module's `auditLog` query (restricted to `super_admin`). This module itself has no resolver.
