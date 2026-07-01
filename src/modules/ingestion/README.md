# Ingestion Module

Provides admin tooling to bulk-import market price data into the platform via CSV file uploads, single-point GraphQL injection, price correction, and scheduled external feed runs.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `DataIngestionJob` | `data_ingestion_jobs` | Tracks the progress and outcome of each import operation |
| `ExternalFeed` | `external_feeds` | A configured external data source with a cron schedule and field mapping |

### Job types

| Type | Triggered by |
|------|-------------|
| `CSV_UPLOAD` | REST file upload |
| `JSON_UPLOAD` | REST file upload (JSON) |
| `EXTERNAL_FEED_RUN` | Manual trigger or cron scheduler |
| `FORECAST_IMPORT` | Forecast data import |

### Job statuses

`PENDING` → `PROCESSING` → `COMPLETED` / `FAILED` / `PARTIAL`

---

## Price correction & supersession

When a price point is corrected via `correctPricePoint`, the original row is **not deleted**. Instead:
1. A new `MarketPricePoint` is created with the corrected value.
2. The old row has `isSuperseded = true` and `supersededBy = newPoint.id` set.
3. A `coin-price-recompute` job is enqueued for the affected crop.

All market queries filter `isSuperseded: false`, so the old row is silently excluded without losing audit history.

---

## External feeds

An `ExternalFeed` describes an external price data URL, its format (`JSON` / `CSV`), a `fieldMap` (maps external field names to internal ones), and a cron `scheduleCron`. Feeds can be paused via `isActive` and triggered manually with `triggerFeedNow`.

The `fieldMap` is a free-form JSON object — the actual parsing logic in the consumer is a placeholder; real feed parsing would use the map to extract price rows from the response.

---

## Architecture

```
REST POST /api/v2/admin/market-data/price-points/bulk
        │  (multipart CSV upload)
        ▼
IngestionService.createJob(CSV_UPLOAD)
        │
        ▼
BullMQ 'ingestion' queue
        │
        ▼
IngestionConsumer.process()
  → marks job PROCESSING → COMPLETED / FAILED
  (real CSV parsing would happen here)

GraphQL injectPricePoint()
  → createPricePoint() directly (no queue)
  → enqueues coin-price-recompute

triggerFeedNow()
  → createJob(EXTERNAL_FEED_RUN)
  → enqueues to 'ingestion' queue
```

---

## REST API (`/api/v2/admin/market-data`, JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/csv-template` | Download a blank CSV template |
| `POST` | `/price-points/bulk` | Upload a CSV file of price points |
| `GET` | `/jobs/:id/errors/csv` | Download per-row errors for a job |

---

## GraphQL API (all `super_admin`)

### Price point mutations

| Mutation | Description |
|----------|-------------|
| `injectPricePoint(input)` | Directly insert a single price point (accepts `cropId` or `cropSlug`) |
| `correctPricePoint(id, newPriceInPesewas)` | Supersede an existing price point with a corrected value |

### Job queries

| Query | Description |
|-------|-------------|
| `ingestionJobs` | List jobs submitted by the current user |
| `ingestionJob(id)` | Single job by ID |

### External feed CRUD

| Operation | Description |
|-----------|-------------|
| `createExternalFeed(input)` | Register a new external feed |
| `externalFeeds` | List all feeds |
| `externalFeed(id)` | Single feed by ID |
| `updateExternalFeed(id, isActive?, scheduleCron?)` | Update feed config |
| `deleteExternalFeed(id)` | Remove a feed |
| `triggerFeedNow(id)` | Immediately enqueue a feed run |
