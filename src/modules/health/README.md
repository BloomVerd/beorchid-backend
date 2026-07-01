# Health Module

Periodically computes a comprehensive `FarmHealth` snapshot for every active farm using
LLM analysis of IoT telemetry, weekly predictions, and historical sensor data. Alerts are
dispatched via in-app notifications, email, and SMS according to farmer preferences.

## Architecture

```
HealthScheduler (cron every 2 min*)
        │
        │  per-farm: check lastComputedAt vs healthReportIntervalSeconds
        ▼
  HealthProducer.enqueueBatch(farmIds)
        │
  health-queue (BullMQ)
        │
  HealthConsumer.process()
        │
  computeFarmHealth(farmId)
        │
  ┌─────┴──────────────────────────────────────────────────────┐
  │  Gather data (parallel):                                    │
  │  - IoT devices (PostgreSQL)                                 │
  │  - Telemetry (DynamoDB farm_telemetry, last N seconds)      │
  │  - Yield comparisons (PostgreSQL)                           │
  │  - Week predictions (PostgreSQL)                            │
  │  - Sensor history (PostgreSQL)                              │
  └─────┬──────────────────────────────────────────────────────┘
        │
  LLM tool loop (up to 5 rounds)
  ┌─────┴──────────────────────────────────────────────────────┐
  │  tool: trigger_iot_device                                   │
  │   → sends notification to farmer (does NOT trigger device)  │
  └─────┬──────────────────────────────────────────────────────┘
        │
  Parse HealthJson response
        │
  Save FarmHealth + sub-entities (parallel):
  - CropFieldHealth[]
  - DiseaseAlert[]
  - HealthAlert[]
  - SensorHistoryPoint[]
  - YieldComparison[]
        │
  Update IotDevice online/offline status
        │
  dispatchHealthNotifications()
  (in-app / email / SMS for CRITICAL & WARNING alerts)
```

*Cron schedule overridable via `HEALTH_CRON_SCHEDULE` env var (default `0 */2 * * * *`).
Actual per-farm interval controlled by `FarmerSettings.healthReportIntervalSeconds` (default 900 s).

## Entities

| Entity                | Key fields                                                              |
|-----------------------|-------------------------------------------------------------------------|
| `FarmHealth`          | Scores (overall, soil, crop, weather_stress, disease_risk), computed_at |
| `CropFieldHealth`     | field_name, health_percent, ndvi, disease_probability, growth_stage     |
| `DiseaseAlert`        | disease_name, probability, spread, treatment, infected_leaves           |
| `HealthAlert`         | severity (INFO/WARNING/CRITICAL), title, description, action            |
| `SensorHistoryPoint`  | date, moisture, temperature, N/P/K                                      |
| `YieldComparison`     | field_name, current_yield, last_season_yield, confidence range, revenue |

## Score scale

All scores are 0–100 (higher = healthier), except:
- `weather_stress` — 0 = no stress, 100 = extreme stress
- `disease_risk` — 0 = no risk, 100 = severe risk

## GraphQL API

| Operation         | Type  | Auth | Description                                                     |
|-------------------|-------|------|-----------------------------------------------------------------|
| `listFarmsHealth` | Query | JWT  | Paginated list of all farms with latest health summary + weather |
| `getFarmHealth`   | Query | JWT  | Full health detail for one farm (all sub-entities + weather)    |

## Queue

| Queue          | Job name                | Payload                |
|----------------|-------------------------|------------------------|
| `health-queue` | `compute-health-batch`  | `{ farmIds: string[] }` |

## Weather

`WeatherService` fetches a 7-day forecast from the Open-Meteo API (no key required) using
the farm's lat/lon. Appended to `listFarmsHealth` and `getFarmHealth` responses.

## Notifications

Dispatched when the computed health contains CRITICAL or WARNING alerts, or any disease alert:

| Channel  | Condition                          |
|----------|------------------------------------|
| In-app   | `FarmerSettings.notifyInApp = true` |
| Email    | `FarmerSettings.notifyEmail = true` |
| SMS      | `FarmerSettings.notifySms = true`  |

## Environment variables

| Variable               | Purpose                                    |
|------------------------|--------------------------------------------|
| `HEALTH_CRON_SCHEDULE` | Override cron schedule (default every 2 min) |
| `LLM_BASE_URL`         | OpenAI-compatible API base URL             |
| `LLM_API_KEY`          | LLM API key                                |
| `LLM_MODEL`            | Model identifier                           |
| `DYNAMODB_*`           | DynamoDB credentials / region / endpoint   |
| `REDIS_URL`            | Used by BullMQ                             |
