# Farm Data Module

Generates AI-powered farm dashboard cards (sensor summary, irrigation recommendation, yield
snapshot) on demand and caches the results in Redis.

## Architecture

```
Client (GraphQL getFarmData)
        │
        ▼
FarmDataService.getFarmData()
        │
  ┌─────┴─────┐
  │ Redis hit? │
  └─────┬─────┘
     YES│                NO
        │          ┌─────┴────────────────────┐
        │          │ pending key exists?       │
        │          └──────────────────────────┘
        │            YES              NO
        │             │         ┌─────┴───────────┐
        │         return        │ set pending key  │
        │         PENDING       │ enqueue job      │
        │                       └──────────────────┘
        │                              │
        ▼                        FarmDataQueue
    return READY                       │
    (cached data)              FarmDataConsumer
                                       │
                        ┌──────────────┴──────────────────┐
                        │ fetch: Farm, FarmHealth,         │
                        │ IoT devices, DynamoDB telemetry, │
                        │ YieldComparisons                 │
                        └──────────────┬──────────────────┘
                                       │
                                  LLM (OpenAI)
                                       │
                              parse JSON response
                                       │
                          FarmDataService.cacheResult()
                             (Redis, TTL from settings)
```

## Status flow

```
PENDING → (worker completes) → READY
PENDING → (worker errors)    → cleared (client retries on next query)
```

| Status    | Meaning                                              |
|-----------|------------------------------------------------------|
| `PENDING` | Job is queued or being processed                     |
| `READY`   | Cached result is available; response includes data   |

## Dashboard sections

The LLM produces up to three sections (keys are omitted when data is absent):

| Section      | Contents                                                              |
|--------------|-----------------------------------------------------------------------|
| `sensors`    | Recent IoT readings + one-sentence summary                            |
| `irrigation` | Recommendation, amount (mm), urgency (hours), next rainfall, badge   |
| `yield`      | Tons/ha, % change vs last season, trend, season label                |

## GraphQL API

| Operation      | Type    | Auth | Description                                         |
|----------------|---------|------|-----------------------------------------------------|
| `getFarmData`  | Query   | JWT  | Returns cached dashboard data or triggers generation |

### Response shape

```graphql
type FarmDataResult {
  status: FarmDataStatus!   # PENDING | READY
  generated_at: String
  sensors: SensorSection
  irrigation: IrrigationSection
  yield: YieldSection
}
```

## Queue

| Queue             | Job name              | Payload           |
|-------------------|-----------------------|-------------------|
| `farm-data-queue` | `generate-farm-data`  | `{ farmId }`      |

## Redis keys

| Key                        | TTL             | Purpose                             |
|----------------------------|-----------------|-------------------------------------|
| `farm_data:{farmId}`       | configurable*   | Cached `FarmDataResult` JSON        |
| `farm_data_pending:{farmId}` | 300 s (5 min) | Deduplication lock while job runs   |

*Default 3600 s; overridden by `FarmerSettings.farmDataCacheTtlSeconds`.

## Data sources

- **PostgreSQL** — `Farm`, `FarmHealth`, `IotDevice`, `YieldComparison`
- **DynamoDB** `farm_telemetry` — raw sensor readings (lookback window from `FarmerSettings.farmDataLookbackSeconds`, default 3600 s)
- **LLM** — OpenAI-compatible model configured via `LLM_*` env vars

## Environment variables

| Variable             | Purpose                                         |
|----------------------|-------------------------------------------------|
| `REDIS_URL`          | Redis connection string                         |
| `LLM_BASE_URL`       | OpenAI-compatible API base URL                  |
| `LLM_API_KEY`        | LLM API key                                     |
| `LLM_MODEL`          | Model identifier (e.g. `gpt-4o`)               |
| `DYNAMODB_*`         | DynamoDB credentials / region / endpoint        |
