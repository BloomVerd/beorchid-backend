# Get Farm Data — Frontend Integration Guide

This document describes how to integrate the `getFarmData` query. The endpoint returns an AI-generated dashboard snapshot (soil sensors, irrigation recommendation, yield forecast) based on the farm's last hour of telemetry. Because the AI call is asynchronous, the first response is always `PENDING` — the frontend must poll until `READY`.

---

## Overview of the flow

```
1. Frontend calls getFarmData(farmId)
2. If the backend has a cached result  → status: READY, sections included
3. If the AI job is already running    → status: PENDING
4. If nothing is cached yet            → backend enqueues the job, returns status: PENDING
5. Frontend polls every few seconds until status: READY
6. Cached result is valid for 1 hour — subsequent calls within that window are instant
```

---

## Types

```typescript
type FarmDataStatus = 'PENDING' | 'READY';

interface SensorReading {
  moisture?: number;       // percentage
  temperature?: number;    // °C
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  recorded_at?: string;    // ISO 8601
}

interface SensorSection {
  readings: SensorReading[];
  summary: string;         // e.g. "Soil moisture at 42%, temperature 28°C"
}

interface IrrigationSection {
  recommendation: string;  // e.g. "Soil moisture is below optimal. Irrigate 25mm within 12 hours."
  amount_mm?: number;      // e.g. 25
  urgency_hours?: number;  // how many hours before irrigation is needed
  next_rainfall?: string;  // e.g. "Tomorrow"
  badge_text: string;      // short label for a chip/badge, e.g. "25mm needed" or "OK"
}

interface YieldSection {
  tons_per_ha: number;     // e.g. 4.2
  change_percent: number;  // positive = increase vs last season, e.g. 8.3
  trend: 'up' | 'down' | 'stable';
  season: string;          // e.g. "2026 Long Rains"
}

interface FarmDataResult {
  status: FarmDataStatus;
  generated_at?: string;         // ISO 8601 — present only when status is READY
  sensors?: SensorSection;       // absent if no sensor readings in the last hour
  irrigation?: IrrigationSection; // absent if no irrigation device or no moisture concern
  yield?: YieldSection;          // absent if no yield comparison data exists
}
```

**Sections are optional.** Only sections where meaningful data is available are included in the response. The frontend should render only what is present, matching the "No sensor data available" empty-state pattern shown in the UI.

---

## GraphQL query

```graphql
query GetFarmData($farmId: String!) {
  getFarmData(farmId: $farmId) {
    status
    generated_at
    sensors {
      readings {
        moisture
        temperature
        nitrogen
        phosphorus
        potassium
        recorded_at
      }
      summary
    }
    irrigation {
      recommendation
      amount_mm
      urgency_hours
      next_rainfall
      badge_text
    }
    yield {
      tons_per_ha
      change_percent
      trend
      season
    }
  }
}
```

**Variables:**
```json
{
  "farmId": "uuid"
}
```

Requires a valid JWT (same `Authorization: Bearer <token>` header used elsewhere).

---

## Polling pattern

The response is always immediate — there is no long-running HTTP connection. Poll until `status` becomes `READY`.

### Vanilla TypeScript

```typescript
async function fetchFarmData(
  farmId: string,
  onReady: (data: FarmDataResult) => void,
  intervalMs = 5000,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  const poll = async () => {
    const { data } = await apolloClient.query({
      query: GET_FARM_DATA,
      variables: { farmId },
      fetchPolicy: 'network-only', // always hit the network, not Apollo cache
    });

    const result: FarmDataResult = data.getFarmData;

    if (result.status === 'READY') {
      onReady(result);
      return;
    }

    if (Date.now() < deadline) {
      setTimeout(poll, intervalMs);
    } else {
      // Timed out — show a "try again" message
      onReady({ status: 'PENDING' });
    }
  };

  await poll();
}
```

### React hook

```typescript
import { useEffect, useState, useRef } from 'react';
import { useApolloClient } from '@apollo/client';

export function useFarmData(farmId: string) {
  const [data, setData] = useState<FarmDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const client = useApolloClient();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!farmId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const result = await client.query({
          query: GET_FARM_DATA,
          variables: { farmId },
          fetchPolicy: 'network-only',
        });

        const farmData: FarmDataResult = result.data.getFarmData;

        if (cancelled) return;

        setData(farmData);

        if (farmData.status === 'PENDING') {
          timerRef.current = setTimeout(poll, 5000);
        } else {
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [farmId]);

  return { data, loading };
}
```

Usage:

```tsx
function FarmDashboard({ farmId }: { farmId: string }) {
  const { data, loading } = useFarmData(farmId);

  if (loading || data?.status === 'PENDING') {
    return <Skeleton />;
  }

  return (
    <>
      {data?.sensors ? (
        <SensorCard readings={data.sensors.readings} summary={data.sensors.summary} />
      ) : (
        <EmptyCard title="Soil Sensors" message="No sensor data available" />
      )}

      {data?.irrigation && (
        <IrrigationCard
          recommendation={data.irrigation.recommendation}
          badge={data.irrigation.badge_text}
          nextRainfall={data.irrigation.next_rainfall}
        />
      )}

      {data?.yield && (
        <YieldCard
          tonsPerHa={data.yield.tons_per_ha}
          changePercent={data.yield.change_percent}
          trend={data.yield.trend}
          season={data.yield.season}
        />
      )}
    </>
  );
}
```

---

## UI recommendations

- **Show a skeleton/loading state** while `status === 'PENDING'`. The AI job typically finishes in 5–15 seconds.
- **Render only present sections.** A farm with no IoT sensors will have no `sensors` key — show an empty state card for it. A farm with no historical yield data will have no `yield` key — omit the card entirely or show an empty state.
- **Cache is 1 hour.** Avoid calling `getFarmData` more than once per session unless the user explicitly refreshes. The result won't change until the cache expires.
- **`badge_text`** on `IrrigationSection` is designed for a chip/pill component (e.g. "25mm needed", "OK"). Keep it as-is — the AI keeps it short.
- **`change_percent`** on `YieldSection` is signed. A positive value means yield is up vs last season; show it with a `+` prefix and an upward arrow. A negative value shows a downward trend.
- **`trend`** is one of `"up"`, `"down"`, `"stable"` — use it to choose an icon color (green / red / neutral) independently of `change_percent`.

---

## Error states

| Scenario | What happens |
|---|---|
| First call on a farm with no data yet | Returns `PENDING`, job is enqueued — poll until `READY` |
| AI job fails (API error, malformed response) | Pending flag is cleared. Next `getFarmData` call re-enqueues the job |
| All sections absent on `READY` response | The farm has no recent sensor data, no yield history, and no irrigation concern — show empty states for all cards |
| Poll times out (>2 min) | Show a "Data is taking longer than expected — try again shortly" message and stop polling |
| Unauthenticated request | GraphQL returns a 401 `Unauthorized` error |
