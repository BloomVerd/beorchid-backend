# Watchlist Module

User watchlists and saved search presets for listings, coins, and investment plans.

---

## Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `Watchlist` | `watchlists` | Pins a user to a watchable entity with an optional price threshold |
| `SavedSearch` | `saved_searches` | Named JSON filter preset that the user can replay |

### WatchlistEntityType

| Value | Watches |
|-------|---------|
| `LISTING` | Farm listings in the marketplace |
| `COIN` | Crop-backed digital coins |
| `INVESTMENT_PLAN` | Investment plan offerings |

---

## Features

### Watchlist

- **Idempotent** — `addToWatchlist` returns the existing entry if `(userId, entityType, entityId)` already exists; no duplicate rows are created.
- **Price threshold** — an optional `priceThreshold` (in pesewas) is stored for future price-alert integration.
- Ownership-scoped — `removeFromWatchlist` filters by both `id` and `userId`, so users can only remove their own entries.

### Saved Searches

- Stores an arbitrary `filters` JSON object under a user-defined `name`.
- Intended for complex multi-field filter states (region, crop type, price range, etc.) that the UI can restore in one call.
- Ownership-scoped — `deleteSavedSearch` filters by both `id` and `userId`.

---

## API

### GraphQL

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `myWatchlist` | Query | JWT | Returns the authenticated user's watchlist entries, newest first |
| `mySavedSearches` | Query | JWT | Returns the authenticated user's saved searches, newest first |
| `addToWatchlist(entityType, entityId, priceThreshold?)` | Mutation | JWT | Adds an entity to the watchlist; idempotent |
| `removeFromWatchlist(id)` | Mutation | JWT | Removes a watchlist entry by ID |
| `createSavedSearch(name, filters)` | Mutation | JWT | Creates a named saved search |
| `deleteSavedSearch(id)` | Mutation | JWT | Deletes a saved search by ID |

---

## Notes

- All operations are scoped to the authenticated user — cross-user access is not possible through these endpoints.
- The `priceThreshold` field is persisted but not yet acted upon; price-alert triggering is a planned future feature.
