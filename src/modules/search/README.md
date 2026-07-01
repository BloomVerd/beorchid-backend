# Search Module

Cross-entity full-text search across listings, coins, investment plans, and crops.

---

## How it works

A single `search(query, limit?)` query runs **four parallel `ILike` queries** against the database and returns aggregated results in a single `SearchResults` response object.

```
query search(query: "maize", limit: 5)
  └─ SearchService.search("maize", 5)
       ├─ Listing  WHERE crop ILIKE '%maize%' OR description ILIKE ... OR region ILIKE ...
       ├─ Coin     WHERE name ILIKE '%maize%' OR symbol ILIKE ...
       ├─ InvestmentPlan WHERE title ILIKE '%maize%'
       └─ Crop     WHERE name ILIKE '%maize%' OR slug ILIKE ...
       → SearchResults { listings, coins, plans, crops }
```

### Indexed fields per entity

| Entity | Fields searched |
|--------|----------------|
| `Listing` | `crop`, `description`, `region` |
| `Coin` | `name`, `symbol` |
| `InvestmentPlan` | `title` |
| `Crop` | `name`, `slug` |

---

## Constraints

| Constraint | Value | Reason |
|-----------|-------|--------|
| Minimum query length | 2 characters | Prevents trivial full-table scans |
| Maximum results per entity | 20 | Hard cap regardless of `limit` argument |
| Default results per entity | 5 | Used when `limit` is omitted |

Queries shorter than 2 characters return empty arrays for all entity types without hitting the database.

---

## API

### GraphQL

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `search(query, limit?)` | Query | JWT | Returns matched listings, coins, plans, and crops |

### Response type

```graphql
type SearchResults {
  listings: [Listing!]!
  coins: [Coin!]!
  plans: [InvestmentPlan!]!
  crops: [Crop!]!
}
```

---

## Notes

- Results within each entity type are ordered by `createdAt DESC`.
- The module has no exports — it is self-contained and not depended on by other modules.
- For production scale, consider replacing `ILike` queries with a dedicated full-text search index (e.g. PostgreSQL `tsvector` or Elasticsearch).
