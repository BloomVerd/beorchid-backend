# Farm Health — Frontend Integration Guide

This document describes how to integrate the `listFarmsHealth` query. The endpoint returns a paginated list of health summaries for every farm belonging to the authenticated farmer. Each summary includes the latest health scores, the highest-priority alert, a 7-day weather forecast (when the farm has GPS coordinates), and any crop-disease or yield predictions run in the past 7 days.

---

## Overview

```
1. Frontend calls listFarmsHealth(page, limit) with a valid JWT
2. Backend returns paginated FarmHealthSummary entries — one per farm
3. Each entry has:
   - healthScore   → overall, soil, crop, weather_stress, disease_risk scores (0-100)
   - topAlert      → highest-severity active alert, or null if none
   - weather       → 7-day daily forecast from Open-Meteo, or null if farm has no GPS
   - predictions   → disease/yield prediction points from the past 7 days, or null
4. Paginate through total / lastPage for all farms
```

---

## Types

```typescript
type CropType = 'MAIZE' | 'RICE' | 'CASSAVA' | 'VEGETABLES';
type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
type RiskLevel = 'low' | 'moderate' | 'high';
type PredictionType = 'DISEASE_PREDICTION' | 'YIELD_PREDICTION';

interface HealthScore {
  id: string;
  overall_score: number;   // 0–100
  soil_health: number;     // 0–100
  crop_health: number;     // 0–100
  weather_stress: number;  // 0–100, higher = more stressed
  disease_risk: number;    // 0–100
  computed_at: string;     // ISO 8601 — when the AI last computed this
}

interface HealthAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  action: string;           // recommended action for the farmer
  estimated_impact: string; // e.g. "~15% yield loss if untreated"
}

interface WeatherForecast {
  date: string;             // "YYYY-MM-DD"
  temperature: number;      // °C, daily average (max+min)/2
  humidity: number;         // % relative humidity (daily max)
  rainfall: number;         // mm of precipitation
  windSpeed: number;        // km/h (daily max)
  description: string;      // e.g. "Clear sky", "Light rain", "Thunderstorm"
  icon: string;             // see Icon values below
}

interface PredictionInsight {
  id: string;
  predictionType: PredictionType;
  riskLevel: RiskLevel | null;
  lat: number;
  lon: number;
  imageUrl: string | null;  // CDN URL of the scan image, if available
  createdAt: string;        // ISO 8601
}

interface FarmHealthSummary {
  farmId: string;
  farmName: string;
  cropType: CropType;
  area: number;             // hectares
  healthScore: HealthScore;
  topAlert: HealthAlert | null;
  weather: WeatherForecast[] | null;       // null when farm has no GPS coordinates
  predictions: PredictionInsight[] | null; // null when no predictions ran this week
}

interface PaginatedFarmHealthSummaries {
  data: FarmHealthSummary[];
  total: number;
  page: number;
  lastPage: number;
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

## GraphQL query

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

**Variables:**
```json
{
  "page": 1,
  "limit": 20
}
```

Requires a valid JWT (`Authorization: Bearer <token>`).

---

## Pagination pattern

```typescript
async function fetchAllFarmHealth(
  apolloClient: ApolloClient<unknown>,
  pageSize = 20,
): Promise<FarmHealthSummary[]> {
  const all: FarmHealthSummary[] = [];
  let page = 1;

  while (true) {
    const { data } = await apolloClient.query({
      query: LIST_FARMS_HEALTH,
      variables: { page, limit: pageSize },
      fetchPolicy: 'network-only',
    });

    const result: PaginatedFarmHealthSummaries = data.listFarmsHealth;
    all.push(...result.data);

    if (page >= result.lastPage) break;
    page++;
  }

  return all;
}
```

### React hook (single page)

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

---

## Rendering each `FarmHealthSummary`

```tsx
function FarmHealthCard({ summary }: { summary: FarmHealthSummary }) {
  const { farmName, cropType, area, healthScore, topAlert, weather, predictions } = summary;

  return (
    <Card>
      <CardHeader title={farmName} subtitle={`${cropType} · ${area} ha`} />

      {/* Health scores */}
      <ScoreRow label="Overall"       value={healthScore.overall_score} />
      <ScoreRow label="Soil"          value={healthScore.soil_health} />
      <ScoreRow label="Crop"          value={healthScore.crop_health} />
      <ScoreRow label="Disease risk"  value={healthScore.disease_risk} inverted />
      <ScoreRow label="Weather stress" value={healthScore.weather_stress} inverted />

      {/* Top alert */}
      {topAlert ? (
        <AlertBanner severity={topAlert.severity} title={topAlert.title} />
      ) : null}

      {/* 7-day weather */}
      {weather ? (
        <WeatherRow forecasts={weather} />
      ) : (
        <EmptyState message="No GPS coordinates — weather unavailable" />
      )}

      {/* Prediction insights */}
      {predictions ? (
        <PredictionList predictions={predictions} />
      ) : (
        <EmptyState message="No scan predictions this week" />
      )}
    </Card>
  );
}
```

---

## UI recommendations

- **Health scores are 0–100.** Use a colour ramp: ≥75 green, 50–74 amber, <50 red. For `weather_stress` and `disease_risk`, higher is worse — invert the colour logic.
- **`topAlert.severity`** drives urgency styling. `CRITICAL` → red banner with immediate action prompt. `WARNING` → amber. `INFO` → blue/neutral.
- **`weather` is `null`** when the farm was created without GPS. Show a soft empty state, not an error.
- **`weather[0]`** is always today's date. The array always contains exactly 7 entries when present.
- **`predictions` is `null`** when no AI scan ran in the past 7 days, not when the scan found no issues. A scan that found issues and one that found none both produce entries.
- **`predictions[n].riskLevel`** can be `null` for yield predictions where no risk classification applies — render it as "—" or omit the badge.
- **`predictions[n].lat` / `lon`** are the GPS coordinates of the specific subplot that was scanned, not the farm centre — use them to plot pins on a farm map overlay.
- **`predictions[n].imageUrl`** may be `null` if the image was deleted or not yet available — guard before rendering an `<img>`.
- **`healthScore.computed_at`** is when the AI last ran for this farm. Surface it as a "Last updated X minutes ago" timestamp so users understand data freshness.

---

## Error states

| Scenario | What the API returns |
|---|---|
| Farmer has no farms | `data: []`, `total: 0` |
| Farm exists but has no health records yet | Farm does not appear in results (only farms with at least one computed health record are listed) |
| Farm has no GPS coordinates | `weather: null` — all other fields still present |
| No predictions ran in the past 7 days | `predictions: null` |
| Weather API is unreachable | `weather: []` — empty array, not null (farm has GPS but fetch failed) |
| Unauthenticated request | GraphQL returns a 401 `Unauthorized` error |
