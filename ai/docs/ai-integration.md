# BeOrchid — AI Integration & Innovation

## Overview

BeOrchid integrates AI at three distinct levels:

1. **Autonomous farm health analysis** — a scheduled pipeline that collects sensor data, calls an LLM to analyze conditions, and can autonomously trigger physical IoT devices
2. **Conversational AI assistant** — a streaming chat interface where the LLM has tool access to live farm data and can control devices on the farmer's behalf
3. **Computer vision predictions** — an external Python/ML service that analyzes geotagged field photos to produce disease and yield risk assessments

These layers work together: health analysis reads from the same database that chat tools query, predictions feed into health context, and IoT actions taken by the LLM are recorded in the same audit log regardless of whether they were triggered by the scheduler or a farmer's chat request.

---

## LLM Configuration

**File:** `src/common/config/llm.config.ts`

The LLM layer uses the **OpenAI SDK** pointed at an Ollama-compatible endpoint. This makes the system LLM-agnostic — any model that exposes an OpenAI-compatible API works without code changes:

```
OLLAMA_BASE_URL=http://localhost:11434   # Ollama local
OLLAMA_BASE_URL=https://api.openai.com   # OpenAI directly
OLLAMA_BASE_URL=https://your-gateway     # Any proxy/gateway
```

```
OLLAMA_MODEL=llama3.2       # Llama (Meta)
OLLAMA_MODEL=qwen2.5:7b     # Qwen (Alibaba)
OLLAMA_MODEL=gemma3:12b     # Gemma (Google)
OLLAMA_MODEL=gpt-4o-mini    # OpenAI (if using OpenAI endpoint)
```

The `createLlmClient()` factory reads `OLLAMA_BASE_URL` and `OLLAMA_API_KEY` at startup and injects the configured client into all consumers that need it. Swapping models requires only an environment variable change — no code deployment needed.

---

## 1. Health Monitoring Pipeline

This is the most architecturally significant AI integration in the system.

### How it works

**Scheduler** (`src/modules/health/health.scheduler.ts`)

A cron job (configurable, default every 2 hours) runs across all active farms. For each farm it checks the `computed_at` timestamp of the most recent `FarmHealth` record. If the farm's health is stale (older than the farmer's `healthReportIntervalSeconds` setting), it enqueues a batch job.

**Consumer** (`src/modules/health/health.consumer.ts`)

The consumer collects context from multiple sources before calling the LLM:

```
Data collection
├── IoT devices:     PostgreSQL (device type, label, active status)
├── Telemetry:       DynamoDB farm_telemetry table
│                    (moisture, humidity, temperature, pH — lookback configurable)
├── Yield history:   PostgreSQL (last 10 YieldComparison records)
├── Predictions:     PostgreSQL (current week's disease/yield predictions)
└── Sensor history:  PostgreSQL (last 10 SensorHistoryPoint records)
```

This context is assembled into a structured text prompt that includes farm metadata (crop, variety, size, soil type, growth stage) and all collected readings.

### Autonomous IoT control

The LLM is given the `trigger_iot_device` tool during health analysis. It may call it up to 5 times per analysis cycle if conditions warrant action:

- Soil moisture critically low → trigger `IRRIGATE` command with duration
- Disease probability high → trigger `CAPTURE_IMAGE` to get fresh field photos
- Sensor offline → trigger `ACTIVATE_SENSOR`

Every tool call is logged to the `IotToolCall` entity with status tracking (PENDING → IN_PROGRESS → COMPLETED/FAILED). AWS IoT Jobs notifies the backend via webhook when execution completes.

### Structured output extraction

The LLM is instructed to return a JSON object. The consumer extracts the JSON block from the response and validates the schema before persisting:

```typescript
{
  overall_score: number,       // 0–100
  soil_health: number,         // 0–100
  crop_health: number,         // 0–100
  weather_stress: number,      // 0–100
  disease_risk: number,        // 0–100

  crop_field_health: [{
    field_name, crop_type, health_percent, ndvi,
    disease_probability, disease_type?, growth_stage, expected_harvest
  }],

  disease_alerts: [{
    disease_name, probability, first_detected,
    spread,          // INCREASING | STABLE | DECREASING
    treatment, infected_leaves?
  }],

  health_alerts: [{
    severity,        // INFO | WARNING | CRITICAL
    title, description, action, estimated_impact
  }],

  sensor_history: [{
    date, moisture, temperature, nitrogen, phosphorus, potassium
  }],

  yield_comparisons: [{
    field_name, current_yield, last_season_yield,
    confidence_min, confidence_max, revenue
  }]
}
```

Results are saved in a cascade across 6 entity types, each with a foreign key back to the parent `FarmHealth` row.

---

## 2. Conversational AI Assistant

**Files:** `src/modules/chat/claude.service.ts`, `src/modules/chat/claude.tools.ts`

### Architecture

The chat system is fully async — GraphQL mutations enqueue the message, and a BullMQ consumer runs the LLM call so there is no HTTP timeout risk. Tokens are delivered to the client over SSE as they are generated.

```
User sends message
  ↓ GraphQL mutation
ChatService saves user message → PostgreSQL
ChatProducer enqueues job → chat-queue
  ↓ BullMQ
ChatConsumer loads full message history
  ↓
ClaudeService.streamAndProcess()
  ↓ tokens + tool events
ChatPubSubService (Redis PubSub)
  ↓ SSE
Client receives token stream
  ↓ on done
ChatService saves assistant message → PostgreSQL
```

### Tool loop

The LLM has access to 5 tools and can call them in any order, up to 5 rounds per session. Each tool result is fed back into the conversation before the next LLM turn, enabling multi-hop reasoning:

| Tool | What it fetches |
|---|---|
| `get_farm_health` | Latest `FarmHealth` with all child records (alerts, disease, sensor history) |
| `get_predictions` | Recent disease and yield `Prediction` rows (configurable limit) |
| `get_iot_devices` | All `IotDevice` records with type, label, and active status |
| `get_farm_details` | `Farm` metadata: name, crop, variety, size, soil, density, GPS coordinates |
| `trigger_iot_device` | Sends a command to a registered device (same as the health pipeline) |

### Message persistence

Every message is stored with `raw_blocks` — the full Anthropic `ContentBlock[]` JSON array. This means tool calls, tool results, and partial responses are all preserved exactly as the API returned them. This enables:
- Exact API replay for debugging
- Full audit trail of which tools were called and what they returned
- Reconstruction of the conversation from any point

### Streaming

`ClaudeService` uses streaming completion (`stream: true`). As chunks arrive, text tokens are published to the farm/chat-specific Redis channel. The SSE endpoint subscribes to that channel and forwards events to the connected client. Event types: `token`, `tool_use`, `done`, `error`.

---

## 3. Computer Vision Predictions

**Files:** `src/modules/predictions/prediction.consumer.ts`, `src/modules/predictions/prediction.service.ts`

BeOrchid does not run the CV model itself — it delegates to an external Python service that handles image analysis. This separation allows the ML team to iterate on models independently.

### Request format

```typescript
POST PREDICTION_BASE_URL/predict?verbose=true

{
  crop: "Maize",
  soil_type: "LOAM",
  growth_stage: "vegetative",
  subplots: [
    { image_url, latitude, longitude, area_ha }
  ],
  farm_metadata: {
    farm_size_ha, latitude, longitude, planting_density,
    elevation_m, days_to_maturity
  }
}
```

`days_to_maturity` is crop-specific (Maize 120, Rice 130, Cassava 365, Vegetables 90).

### Risk level derivation

**Disease predictions:**
- `predicted_class == "healthy"` → `LOW`
- `severity >= 0.5` → `HIGH`
- otherwise → `MODERATE`

**Yield predictions:**
- `water_stress_pct < 0.3` → `LOW`
- `water_stress_pct 0.3–0.59` → `MODERATE`
- `water_stress_pct >= 0.6` → `HIGH`

### Weekly quota enforcement

Each farmer has a `predictionWeeklyLimit` (default 3, configurable per subscription plan). The `PredictionRange` entity tracks the current week's usage via a `regeneration_count` column. Attempts beyond the limit are rejected at the service layer before any job is enqueued.

---

## 4. Farm Data Dashboard Summarization

**File:** `src/modules/farm-data/farm-data.consumer.ts`

When the frontend requests a dashboard view (`getFarmData` query), the system:

1. Checks Redis for a cached result (TTL: `farmDataCacheTtlSeconds`)
2. On cache miss, enqueues a `generate-farm-data` job
3. The consumer collects latest `FarmHealth`, IoT devices, and recent DynamoDB telemetry
4. Calls the LLM with a 1024-token output budget to produce a structured summary:

```typescript
{
  sensors?: {
    readings: [{ moisture, temperature, nitrogen, phosphorus, potassium, recorded_at }],
    summary: string
  },
  irrigation?: {
    recommendation: string,
    amount_mm?, urgency_hours?, next_rainfall?,
    badge_text: string
  },
  yield?: {
    tons_per_ha, change_percent, trend: "up" | "down" | "stable", season
  }
}
```

The result is cached in Redis so repeated dashboard loads do not hit the LLM.

---

## IoT Automation Audit Trail

Every device command issued by the AI (in either the health pipeline or chat) is recorded in `IotToolCall`:

```
IotToolCall
  ├── command_type   IRRIGATE | STOP_IRRIGATION | CAPTURE_IMAGE | ACTIVATE_SENSOR | DEACTIVATE_SENSOR
  ├── parameters     JSON (e.g. { "duration_minutes": 30 })
  ├── status         PENDING → IN_PROGRESS → COMPLETED | FAILED
  ├── response       JSON result from the physical device
  ├── requested_by   farmer UUID or "ai-health-pipeline" / "ai-chat"
  └── iot_device     → IotDevice
```

The `requested_by` field distinguishes AI-initiated actions from farmer-initiated ones, which matters for compliance and debugging.

---

## Innovation Highlights

### Agentic decision loop
The health pipeline does not just observe — it acts. When the LLM sees critically low soil moisture, it issues an irrigation command directly through the IoT layer. This closes the sensing-to-action loop without requiring a human to read an alert and manually respond.

### LLM-agnostic architecture
The OpenAI-compatible client abstraction means the system can run on open-weight models (Llama, Qwen, Gemma) via Ollama, or on commercial APIs (OpenAI, Anthropic) by changing two environment variables. As open-weight models improve and costs drop, BeOrchid benefits automatically.

### Multi-source context fusion
The health consumer fuses five distinct data sources (real-time telemetry, historical yields, current predictions, device inventory, sensor trends) into a single LLM call. The LLM performs the cross-source reasoning that would otherwise require custom rule engines for every combination of conditions.

### Tool-use loops for both automated and interactive AI
Both the health pipeline and the chat assistant use multi-round tool-use loops (up to 5 rounds each). This allows the LLM to gather exactly the information it needs rather than receiving a fixed context dump — a pattern that scales well as farm complexity grows.

### Shared IoT control plane
The same `trigger_iot_device` tool definition and the same `IotToolCall` audit log are used by both the health pipeline and the chat assistant. Farmers can ask "did the AI irrigate my field last night?" and get a direct answer from the audit log, regardless of which AI subsystem issued the command.
