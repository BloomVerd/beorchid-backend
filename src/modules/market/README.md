# Market Module

Provides crop price intelligence for the beorchid platform — a catalogue of tradeable crops, historical price observations, AI-generated price forecasts, and editorial market survey insights.

All read queries are publicly accessible (no authentication required). Write operations are restricted to `super_admin`.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `Crop` | `crops` | Master catalogue of tradeable agricultural crops |
| `MarketPricePoint` | `market_price_points` | Observed market prices per crop, region, and time |
| `PriceForecast` | `price_forecasts` | Model-generated price predictions with confidence bands |
| `MarketSurveyInsight` | `market_survey_insights` | Editorial analysis published by admins |

### Price types (`PriceType`)

| Value | Meaning |
|-------|---------|
| `FARM_GATE` | Price at the farm |
| `WHOLESALE` | Bulk market price |
| `RETAIL` | Consumer-facing price |
| `AUCTION` | Auction clearing price |
| `INDEX` | Composite/index price |

### Insight types (`InsightType`)

`SUPPLY_DEMAND` · `SEASONALITY` · `VOLATILITY` · `REGIONAL_COMPARISON` · `TOP_CROPS` · `REPORT`

---

## Price amounts

All price values (`price`, `predictedPrice`, `confidenceLow`, `confidenceHigh`) are stored and returned as **pesewas** (GHS × 100). Divide by 100 to display in GHS.

---

## Price point supersession

A `MarketPricePoint` row carries `isSuperseded: boolean` and an optional `supersededBy` reference. When a price is corrected or updated by a newer observation, the old row is flagged `isSuperseded = true` rather than deleted. All queries filter on `isSuperseded: false` so only the current price series is returned.

---

## Seeder

`MarketSeeder` runs on application startup and seeds two years of **weekly wholesale price history** for Maize and Rice across four regions (`ashanti`, `northern`, `greater_accra`, `brong_ahafo`). Seeding is idempotent — it exits early if any price data already exists for Maize.

---

## GraphQL API

### Queries (public)

| Query | Description |
|-------|-------------|
| `crops(category?, region?)` | All crops, optionally filtered |
| `crop(id)` | Single crop by ID |
| `topCrops` | Top 10 crops by name |
| `cropPrices(cropId, region?, from?, to?)` | Historical price points for a crop |
| `cropForecast(cropId, region, horizonDays?)` | Price forecasts for a crop |
| `marketInsights(type?, cropId?, region?)` | Published market survey insights |
| `marketInsight(id)` | Single insight by ID |

### Mutations (super_admin only)

| Mutation | Description |
|----------|-------------|
| `createCrop(input)` | Adds a new crop to the catalogue |
| `publishInsight(input)` | Publishes a market survey insight |
| `publishForecast(input)` | Publishes a price forecast |

### Resolved fields on `Crop`

| Field | Description |
|-------|-------------|
| `recentPrices` | Last 24 non-superseded price points, ordered by `observedAt` ASC |
| `coin` | The crop's associated beorchid coin (if one exists) |

---

## Data flow

```
External source / field observation / admin
        │
        ▼
createPricePoint()  ← called by ingestion jobs or field-observation pipeline
        │
        ▼
market_price_points (isSuperseded = false)
        │
        ├─── cropPrices() query ──→ historical chart data
        └─── getRecentPricesForCrop() ──→ Crop.recentPrices resolved field

super_admin publishes insight / forecast
        │
        ├─── publishInsight() ──→ market_survey_insights
        └─── publishForecast() ──→ price_forecasts
```
