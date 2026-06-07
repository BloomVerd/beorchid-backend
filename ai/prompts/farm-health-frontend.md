# Farm Health — Frontend Integration Guide

This document describes how to integrate the two farm health queries:

- **`listFarmsHealth`** — paginated overview of all farms, used on the health dashboard
- **`getFarmHealth`** — full detail report for a single farm, used on the farm detail page

Both return weather forecasts (when the farm has GPS coordinates) and crop prediction insights (when a scan ran in the past 7 days).

---

## Overview

```
listFarmsHealth(page, limit)
  └─ PaginatedFarmHealthSummaries
       └─ FarmHealthSummary[]
            ├─ healthScore   → overall, soil, crop, weather_stress, disease_risk (0-100)
            ├─ topAlert      → highest-severity active alert, or null
            ├─ weather       → 7-day forecast, or null if no GPS
            └─ predictions   → scan points from the past 7 days, or null

getFarmHealth(farmId)
  └─ FarmHealthDetail
       ├─ health            → full FarmHealth record with all nested relations
       │    ├─ crop_field_health[]
       │    ├─ disease_alerts[]
       │    ├─ health_alerts[]
       │    ├─ sensor_history[]
       │    └─ yield_comparisons[]
       ├─ weather           → 7-day forecast, or null if no GPS
       └─ predictions       → scan points from the past 7 days, or null
```

---

## Types

```typescript
type CropType      = 'MAIZE' | 'RICE' | 'CASSAVA' | 'VEGETABLES';
type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
type RiskLevel     = 'low' | 'moderate' | 'high';
type PredictionType = 'DISEASE_PREDICTION' | 'YIELD_PREDICTION';
type GrowthStage   = 'GERMINATION' | 'VEGETATIVE' | 'FLOWERING' | 'MATURITY';
type DiseaseSpread = 'STABLE' | 'SPREADING' | 'CONTAINED';

interface WeatherForecast {
  date: string;          // "YYYY-MM-DD"
  temperature: number;   // °C, daily average (max+min)/2
  humidity: number;      // % relative humidity (daily max)
  rainfall: number;      // mm of precipitation
  windSpeed: number;     // km/h (daily max)
  description: string;   // e.g. "Clear sky", "Light rain", "Thunderstorm"
  icon: string;          // see Icon values table below
}

interface PredictionInsight {
  id: string;
  predictionType: PredictionType;
  riskLevel: RiskLevel | null;  // null for yield predictions
  lat: number;                  // subplot GPS, not farm centre
  lon: number;
  imageUrl: string | null;
  createdAt: string;            // ISO 8601
}

// ── List view types ──────────────────────────────────────────────────────────

interface HealthScore {
  id: string;
  overall_score: number;   // 0–100
  soil_health: number;     // 0–100
  crop_health: number;     // 0–100
  weather_stress: number;  // 0–100, higher = more stressed
  disease_risk: number;    // 0–100
  computed_at: string;     // ISO 8601 — when the AI last ran
}

interface HealthAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  action: string;           // recommended action for the farmer
  estimated_impact: string; // e.g. "~15% yield loss if untreated"
}

interface FarmHealthSummary {
  farmId: string;
  farmName: string;
  cropType: CropType;
  area: number;                            // hectares
  healthScore: HealthScore;
  topAlert: HealthAlert | null;
  weather: WeatherForecast[] | null;       // null when farm has no GPS
  predictions: PredictionInsight[] | null; // null when no scan ran this week
}

interface PaginatedFarmHealthSummaries {
  data: FarmHealthSummary[];
  total: number;
  page: number;
  lastPage: number;
}

// ── Detail view types ────────────────────────────────────────────────────────

interface CropFieldHealth {
  id: string;
  field_name: string;
  crop_type: CropType;
  health_percent: number;      // 0–100
  ndvi: number;                // Normalized Difference Vegetation Index
  disease_probability: number; // 0–100
  growth_stage: GrowthStage;
  expected_harvest: string;    // e.g. "2026-08-15"
  createdAt: string;
  updatedAt: string;
}

interface DiseaseAlert {
  id: string;
  disease_name: string;
  probability: number;          // 0–100
  first_detected: string;       // ISO 8601
  spread: DiseaseSpread;
  treatment: string;
  infected_leaves: number | null;
  createdAt: string;
  updatedAt: string;
}

interface SensorHistoryPoint {
  id: string;
  date: string;       // "YYYY-MM-DD"
  moisture: number;
  temperature: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  createdAt: string;
  updatedAt: string;
}

interface YieldComparison {
  id: string;
  field_name: string;
  current_yield: number;       // tons/ha
  last_season_yield: number;   // tons/ha
  confidence_min: number;      // lower bound of forecast range
  confidence_max: number;      // upper bound of forecast range
  revenue: number;             // projected revenue
  createdAt: string;
  updatedAt: string;
}

interface FarmHealth {
  id: string;
  overall_score: number;
  soil_health: number;
  crop_health: number;
  weather_stress: number;
  disease_risk: number;
  computed_at: string;
  createdAt: string;
  updatedAt: string;
  crop_field_health: CropFieldHealth[];
  disease_alerts: DiseaseAlert[];
  health_alerts: HealthAlert[];
  sensor_history: SensorHistoryPoint[];
  yield_comparisons: YieldComparison[];
}

interface FarmHealthDetail {
  health: FarmHealth;
  weather: WeatherForecast[] | null;
  predictions: PredictionInsight[] | null;
}
```

### `weather.icon` values

| Value | Meaning |
|---|---|
| `sun` | Clear sky |
| `cloud-sun` | Partly cloudy |
| `cloud` | Overcast or foggy |
| `cloud-drizzle` | Drizzle |
| `cloud-rain` | Rain or showers |
| `cloud-snow` | Snow |
| `cloud-lightning` | Thunderstorm |

---

## GraphQL queries

### List — health dashboard

```graphql
query ListFarmsHealth($page: Int = 1, $limit: Int = 20) {
  listFarmsHealth(page: $page, limit: $limit) {
    total
    page
    lastPage
    data {
      farmId
      farmName
      cropType
      area

      healthScore {
        id
        overall_score
        soil_health
        crop_health
        weather_stress
        disease_risk
        computed_at
      }

      topAlert {
        id
        severity
        title
        description
        action
        estimated_impact
      }

      weather {
        date
        temperature
        humidity
        rainfall
        windSpeed
        description
        icon
      }

      predictions {
        id
        predictionType
        riskLevel
        lat
        lon
        imageUrl
        createdAt
      }
    }
  }
}
```

**Variables:** `{ "page": 1, "limit": 20 }`

### Detail — single farm page

```graphql
query GetFarmHealth($farmId: String!) {
  getFarmHealth(farmId: $farmId) {
    health {
      id
      overall_score
      soil_health
      crop_health
      weather_stress
      disease_risk
      computed_at

      crop_field_health {
        id
        field_name
        crop_type
        health_percent
        ndvi
        disease_probability
        growth_stage
        expected_harvest
      }

      disease_alerts {
        id
        disease_name
        probability
        first_detected
        spread
        treatment
        infected_leaves
      }

      health_alerts {
        id
        severity
        title
        description
        action
        estimated_impact
      }

      sensor_history {
        id
        date
        moisture
        temperature
        nitrogen
        phosphorus
        potassium
      }

      yield_comparisons {
        id
        field_name
        current_yield
        last_season_yield
        confidence_min
        confidence_max
        revenue
      }
    }

    weather {
      date
      temperature
      humidity
      rainfall
      windSpeed
      description
      icon
    }

    predictions {
      id
      predictionType
      riskLevel
      lat
      lon
      imageUrl
      createdAt
    }
  }
}
```

**Variables:** `{ "farmId": "uuid" }`

Both queries require a valid JWT (`Authorization: Bearer <token>`).

---

## React hooks

### List hook

```typescript
import { useQuery } from '@apollo/client';

export function useFarmHealthList(page = 1, limit = 20) {
  const { data, loading, error, refetch } = useQuery(LIST_FARMS_HEALTH, {
    variables: { page, limit },
    fetchPolicy: 'cache-and-network',
  });

  return {
    summaries: (data?.listFarmsHealth.data ?? []) as FarmHealthSummary[],
    total: data?.listFarmsHealth.total ?? 0,
    lastPage: data?.listFarmsHealth.lastPage ?? 1,
    loading,
    error,
    refetch,
  };
}
```

Usage:

```tsx
function FarmHealthDashboard() {
  const [page, setPage] = useState(1);
  const { summaries, lastPage, loading } = useFarmHealthList(page);

  if (loading && summaries.length === 0) return <Skeleton />;

  return (
    <>
      {summaries.map((farm) => (
        <FarmHealthCard key={farm.farmId} summary={farm} />
      ))}
      <Pagination current={page} total={lastPage} onChange={setPage} />
    </>
  );
}
```

### Detail hook

```typescript
export function useFarmHealthDetail(farmId: string) {
  const { data, loading, error, refetch } = useQuery(GET_FARM_HEALTH, {
    variables: { farmId },
    fetchPolicy: 'cache-and-network',
    skip: !farmId,
  });

  return {
    detail: data?.getFarmHealth as FarmHealthDetail | undefined,
    loading,
    error,
    refetch,
  };
}
```

Usage:

```tsx
function FarmDetailPage({ farmId }: { farmId: string }) {
  const { detail, loading } = useFarmHealthDetail(farmId);

  if (loading || !detail) return <Skeleton />;

  const { health, weather, predictions } = detail;

  return (
    <>
      <ScorePanel health={health} />

      {health.crop_field_health.map((field) => (
        <CropFieldCard key={field.id} field={field} />
      ))}

      {health.disease_alerts.map((alert) => (
        <DiseaseAlertCard key={alert.id} alert={alert} />
      ))}

      <SensorChart history={health.sensor_history} />

      <YieldTable comparisons={health.yield_comparisons} />

      {weather ? (
        <WeatherPanel forecasts={weather} />
      ) : (
        <EmptyState message="No GPS coordinates — weather unavailable" />
      )}

      {predictions ? (
        <PredictionMap points={predictions} />
      ) : (
        <EmptyState message="No scan predictions this week" />
      )}
    </>
  );
}
```

---

## UI recommendations

- **Health scores are 0–100.** Colour ramp: ≥75 green, 50–74 amber, <50 red. Invert for `weather_stress` and `disease_risk` — higher is worse.
- **`topAlert.severity`** drives urgency: `CRITICAL` → red banner with immediate action prompt; `WARNING` → amber; `INFO` → blue/neutral.
- **`weather` is `null`** when the farm has no GPS coordinates — show a soft empty state, not an error.
- **`weather[0]`** is always today. The array always has exactly 7 entries when non-null.
- **`weather: []` (empty array)** means the farm has GPS but the weather API was temporarily unreachable — distinguish from `null`.
- **`predictions` is `null`** when no AI scan ran in the past 7 days, not when a scan found no issues. A clean scan still produces entries.
- **`predictions[n].riskLevel`** can be `null` for yield predictions — render as "—" or omit the badge.
- **`predictions[n].lat` / `lon`** are the scanned subplot coordinates, not the farm centre — use them for map pins on a field overlay.
- **`predictions[n].imageUrl`** may be `null` — guard before rendering an `<img>`.
- **`health.computed_at`** is when the AI last ran. Surface it as "Last updated X minutes ago" so users understand data freshness.
- **`disease_alerts[n].spread`** drives urgency: `SPREADING` → red chip; `STABLE` → amber; `CONTAINED` → green.
- **`yield_comparisons[n].confidence_min/max`** form a forecast range band — render as a range bar alongside `current_yield`.

---

## Error states

| Scenario | What the API returns |
|---|---|
| Farmer has no farms | `listFarmsHealth`: `data: []`, `total: 0` |
| Farm exists but health not yet computed | Farm absent from `listFarmsHealth`; `getFarmHealth` throws `NotFoundException` |
| Farm has no GPS coordinates | `weather: null` on both queries — all other fields still present |
| No scan ran in the past 7 days | `predictions: null` on both queries |
| Weather API temporarily unreachable | `weather: []` — empty array, not null |
| Unauthenticated request | GraphQL returns a 401 `Unauthorized` error |
