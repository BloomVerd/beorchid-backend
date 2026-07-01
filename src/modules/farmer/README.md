# Farmer Module

Central identity module. Owns the `Farmer` entity (accounts, roles, auth tokens) and
`FarmerSettings` (per-farmer notification and pipeline preferences). Exported so other
modules can look up farmers and read settings without circular imports.

## Entities

### Farmer

| Field            | Type       | Notes                                                     |
|------------------|------------|-----------------------------------------------------------|
| `id`             | UUID       | Primary key                                               |
| `email`          | string     | Unique, used for magic-link and OAuth login               |
| `firstName`      | string     |                                                           |
| `lastName`       | string     |                                                           |
| `passwordHash`   | string     | SHA-256 bcrypt hash; excluded from default selects        |
| `roles`          | string[]   | e.g. `['farmer']`, `['super_admin']`                     |
| `country`        | string     | ISO 3166-1 alpha-2 (default `GH`)                        |
| `isActive`       | boolean    | `false` = suspended by admin                              |
| `googleId`       | string?    | Set on Google OAuth sign-in                               |
| `refreshTokenHash` | string?  | SHA-256 hash of the last issued refresh token             |
| `magicLinkTokenHash` | string? | SHA-256 hash of the last issued magic-link token        |

### FarmerSettings

| Field                        | Type    | Default  | Notes                                       |
|------------------------------|---------|----------|---------------------------------------------|
| `notifyInApp`                | boolean | `true`   | In-app notification toggle                  |
| `notifyEmail`                | boolean | `true`   | Email notification toggle                   |
| `notifySms`                  | boolean | `false`  | SMS notification toggle                     |
| `smsPhoneNumber`             | string? | —        | Required when `notifySms = true`            |
| `healthReportIntervalSeconds`| number  | `900`    | Scheduler poll interval per farm (15 min)   |
| `predictionWeeklyLimit`      | number  | `3`      | Max prediction regenerations per week        |
| `farmDataCacheTtlSeconds`    | number  | `3600`   | Dashboard data Redis TTL                    |
| `farmDataLookbackSeconds`    | number  | `3600`   | DynamoDB telemetry query window             |

## GraphQL API

### FarmerResolver

| Operation          | Type     | Auth                        | Description                         |
|--------------------|----------|-----------------------------|-------------------------------------|
| `getMe`            | Query    | JWT                         | Returns the authenticated farmer    |
| `adminCreateUser`  | Mutation | JWT + `super_admin` role    | Creates a farmer account via admin  |

### FarmerSettingsResolver

| Operation        | Type     | Auth | Description                                      |
|------------------|----------|------|--------------------------------------------------|
| `getMySettings`  | Query    | JWT  | Returns (or creates) the farmer's settings row   |
| `updateSettings` | Mutation | JWT  | Partial update of notification / pipeline prefs  |

## Exports

`FarmerModule` exports `FarmerService`, `FarmerSettingsService`, and `TypeOrmModule`
(with `Farmer` and `FarmerSettings` repositories). Other modules import `FarmerModule`
to access farmers and settings without re-registering the entities.

## Notes

- `FarmerSettingsService.getOrCreate()` is idempotent — it creates a settings row with
  defaults if one doesn't exist yet. Called by health, prediction, and farm-data workers.
- `passwordHash` is excluded from the default TypeORM select to avoid leaking it through
  GraphQL; `findByEmailWithPassword()` explicitly adds it back for login flows.
