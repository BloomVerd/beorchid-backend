# Predictions Module

Generates per-subplot crop disease and yield risk predictions by calling an external ML
API. Results are stored as `Prediction` rows and surfaced via GraphQL. Weekly regeneration
limits are enforced via `PredictionRange` + `FarmerSettings.predictionWeeklyLimit`.

## Architecture

```
Farmer calls generateFarmPredictions(farmId)
        │
PredictionService.generateFarmPredictions()
        │
  ┌─────┴───────────────────────────────────────────┐
  │ Transaction:                                     │
  │  - verify farm has images                        │
  │  - find or create PredictionRange for this week  │
  │  - enforce weeklyLimit (SubscriptionLimitError)  │
  │  - increment regeneration_count                  │
  └─────┬───────────────────────────────────────────┘
        │
PredictionProducer.createPrediction(farmId)
        │
  prediction-queue (BullMQ)
        │
PredictionConsumer.computePredictions(farmId)
        │
  ┌─────┴─────────────────────────────────────────────────┐
  │  Load farm + images (range_images or farm_images)      │
  │  Delete old predictions for this week                  │
  │  Build PredictionApiRequest (subplots, farm_metadata)  │
  │  POST /predict?verbose=true  →  PredictionApiResponse  │
  └─────┬─────────────────────────────────────────────────┘
        │
  For each subplot × prediction_type:
    - derive RiskLevel (disease severity or water_stress_pct)
    - build description text
    - create Prediction row
        │
  Save all Prediction rows
        │
  dispatchNotifications()
  (in-app / email / SMS per FarmerSettings)
```

## Entities

### Prediction

| Field             | Type           | Notes                                            |
|-------------------|----------------|--------------------------------------------------|
| `id`              | UUID           | Primary key                                      |
| `prediction_type` | PredictionType | `DISEASE_PREDICTION` or `YIELD_PREDICTION`        |
| `risk_level`      | RiskLevel?     | `LOW`, `MODERATE`, `HIGH`                        |
| `lat` / `lon`     | float          | Subplot GPS coordinates                          |
| `description`     | string         | Human-readable result e.g. "Leaf blight 72% confidence" |
| `farm`            | Farm           | Owning farm                                      |
| `image`           | ImageData      | Source image for this subplot                    |

### PredictionRange

Tracks one prediction batch per ISO week per farm. The `regeneration_count` is incremented
each time `generateFarmPredictions` is called; capped at `FarmerSettings.predictionWeeklyLimit`.

| Field                | Type    | Notes                              |
|----------------------|---------|------------------------------------|
| `week_start`         | Date    | Monday 00:00:00 of the ISO week    |
| `week_end`           | Date    | Sunday 23:59:59 of the ISO week    |
| `regeneration_count` | number  | Starts at 1, max = weekly limit    |
| `range_images`       | ImageData[] | Images uploaded for this range |

## Risk derivation

| Type               | Input                    | Rule                                        |
|--------------------|--------------------------|---------------------------------------------|
| Disease prediction | `disease.severity`       | `< 0.5` → MODERATE, `≥ 0.5` → HIGH         |
| Disease prediction | `predicted_class`        | `"healthy"` → LOW                           |
| Yield prediction   | `yield.water_stress_pct` | `< 0.3` → LOW, `< 0.6` → MODERATE, else HIGH|

## GraphQL API

### PredictionResolver

| Operation                 | Type     | Auth | Description                                     |
|---------------------------|----------|------|-------------------------------------------------|
| `generateFarmPredictions` | Mutation | JWT  | Enqueues a prediction job; enforces weekly limit |
| `listFarmPredictions`     | Query    | JWT  | Paginated predictions, optionally by year/month/week |

### PredictionRangeResolver

| Operation               | Type     | Auth | Description                               |
|-------------------------|----------|------|-------------------------------------------|
| `createPredictionRange` | Mutation | JWT  | Manually creates a range for current week  |

## Queue

| Queue              | Job name              | Payload           |
|--------------------|-----------------------|-------------------|
| `prediction-queue` | `create-predictions`  | `{ farmId }`      |

## External ML API

The consumer posts to `PREDICTION_BASE_URL/predict?verbose=true`. Request shape:

```json
{
  "crop": "Maize",
  "soil_type": "loam",
  "growth_stage": "vegetative",
  "subplots": [{ "image_url": "…", "latitude": 5.6, "longitude": -0.2, "area_ha": 0.5 }],
  "farm_metadata": { "farm_size_ha": 2.0, "latitude": 5.6, "longitude": -0.2, "planting_density": null, "elevation_m": 0, "days_to_maturity": 120 }
}
```

## Notifications

Dispatched after predictions are saved when at least one HIGH or MODERATE result exists:

| Channel  | Condition                           |
|----------|-------------------------------------|
| In-app   | `FarmerSettings.notifyInApp = true`  |
| Email    | `FarmerSettings.notifyEmail = true`  |
| SMS      | `FarmerSettings.notifySms = true`   |

## Environment variables

| Variable              | Purpose                                        |
|-----------------------|------------------------------------------------|
| `PREDICTION_BASE_URL` | ML API base URL (default `http://localhost:8000`) |
| `REDIS_URL`           | Used by BullMQ                                 |
