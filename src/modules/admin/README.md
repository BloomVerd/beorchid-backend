# Admin Module

Provides super-admin-only GraphQL operations for platform governance: viewing all users, deals and offers, reading aggregate platform metrics, querying the audit log, managing user roles and suspension status, granting/revoking field-agent privileges, and seeding the initial super-admin account on first boot.

---

## GraphQL API

All queries and mutations in this module require a valid JWT **and** the `super_admin` role (`GqlJwtAuthGuard` + `RolesGuard` applied at the resolver class level).

### Queries

| Query | Description |
|-------|-------------|
| `adminUsers` | All registered users ordered by creation date |
| `adminDeals` | All deals on the platform ordered by creation date |
| `adminOffers` | All offers on the platform ordered by creation date |
| `adminMetrics` | Aggregate platform KPIs with week-over-week deltas |
| `auditLog(entity?, from?, to?)` | Up to 200 most recent audit log entries, filterable by entity type and date range |

### Mutations

| Mutation | Description |
|----------|-------------|
| `updateUserRoles(userId, roles)` | Replace a user's role array |
| `suspendUser(userId)` | Deactivate a user account (`isActive = false`) |
| `grantFieldAgent(userId)` | Set `isFieldAgent = true` on a user |
| `revokeFieldAgent(userId)` | Set `isFieldAgent = false` on a user |

---

## Metrics (`adminMetrics`)

`AdminMetrics` computes the following KPIs in a single parallel query batch:

| Field | Description |
|-------|-------------|
| `gmv` | Gross merchandise value — sum of all completed deal amounts |
| `aum` | Assets under management — principal of all active investment purchases |
| `coinVolume` | Total gross amount of BUY-side coin transactions |
| `activeInvestments` | Count of active investment purchases |
| `totalListings` | Total farm listings ever created |
| `totalDeals` | Total deals ever created |
| `totalUsers` | Total registered users |
| `*Delta` | Week-over-week percentage change for each metric (null when prior-week value is 0) |

Deltas compare the current week (last 7 days) against the previous week (7–14 days ago).

---

## Super-admin Seeding

`AdminSeedService.seedSuperAdmin()` is called during application bootstrap (via `AppModule`). It checks for `SUPER_ADMIN_EMAIL` in the environment. If no user with that email exists, it:

1. Generates a cryptographically random 12-byte password.
2. Creates the `Farmer` record with `roles: ['super_admin']`.
3. Sends the credentials via the `super-admin-credentials` email template.

The seed is idempotent — calling it again when the account already exists is a no-op.

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `SUPER_ADMIN_EMAIL` | Email for the seeded super-admin account |
| `SUPER_ADMIN_FIRST_NAME` | First name (defaults to `"Admin"`) |
| `SUPER_ADMIN_LAST_NAME` | Last name (defaults to `"User"`) |
