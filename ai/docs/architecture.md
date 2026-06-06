# BeOrchid Backend — System Architecture

## Overview

BeOrchid is a NestJS v11 application built on TypeScript. It exposes a GraphQL API (Apollo Server v5) and a thin REST layer for webhooks, OAuth callbacks, and SSE streams. All long-running work — LLM inference, ML predictions, email sending — is offloaded to BullMQ workers so HTTP handlers stay fast.

```
┌─────────────────────────────────────────────────────────┐
│                      Client Layer                        │
│          Mobile App / Web Dashboard / CLI                │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │  GraphQL (Apollo Server v5)  │   ← primary API
          │  REST (webhooks, SSE, OAuth) │   ← secondary
          └──────────────┬──────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   NestJS Modules                         │
│  Auth  Farmer  Farm  Health  Predictions                 │
│  Chat  Payment  Email  FarmData  Upload                  │
└────────────────────────┬────────────────────────────────┘
                         │  BullMQ jobs (Redis-backed)
┌────────────────────────▼────────────────────────────────┐
│                     Workers                              │
│  HealthConsumer     PredictionConsumer                   │
│  ChatConsumer       EmailProcessor                       │
│  FarmDataConsumer                                        │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   Infrastructure                         │
│  PostgreSQL 17   Redis   DynamoDB (telemetry)            │
│  AWS IoT Core    Cloudflare R2   Ollama / LLM            │
│  External Python ML Prediction Service                   │
└─────────────────────────────────────────────────────────┘
```

---

## Module Breakdown

| Module | Responsibility | Key Entities |
|---|---|---|
| **AuthModule** | JWT + refresh token lifecycle, magic-link passwordless auth, Google OAuth, password-based login | `MagicLinkToken`, `RefreshToken` |
| **FarmerModule** | Farmer profile, per-farmer configurable settings (cache TTL, prediction limits, health interval) | `Farmer`, `FarmerSettings` |
| **FarmModule** | Farm CRUD, GPS coordinates, field photos, IoT device provisioning (AWS IoT Core), SSE stream for device events | `Farm`, `Coordinate`, `ImageData`, `IotDevice`, `IotToolCall` |
| **HealthModule** | Scheduled AI health pipeline — collects telemetry, runs LLM analysis, stores structured results, exposes health queries | `FarmHealth`, `CropFieldHealth`, `HealthAlert`, `DiseaseAlert`, `SensorHistoryPoint`, `YieldComparison` |
| **PredictionModule** | Queues and processes disease/yield prediction requests against an external CV service; enforces weekly quotas | `Prediction`, `PredictionRange` |
| **ChatModule** | Streaming AI chat sessions with farm tool access; BullMQ consumer + PubSub for SSE token delivery | `Chat`, `ChatMessage` |
| **PaymentModule** | Subscription plan management, Paystack transaction init + webhook verification, plan limits synced to FarmerSettings | `SubscriptionPlan`, `FarmerSubscription`, `PaymentTransaction` |
| **EmailModule** | Queue-based email delivery; Handlebars templates; Gmail SMTP in production, Ethereal in dev | — |
| **FarmDataModule** | LLM-generated dashboard summary (sensors, irrigation recommendation, yield trend); result cached in Redis | — |
| **UploadModule** | Presigned S3/R2 URL generation for images, documents, and videos; file deletion | — |

---

## Data Flow Diagrams

### 1. Health Monitoring Pipeline

```
HealthScheduler (cron, default every 2h)
  │  identifies farms with stale health records
  ▼
HealthProducer
  │  enqueues batch of farm IDs → "health-queue"
  ▼
HealthConsumer (BullMQ worker)
  ├── DynamoDB: fetch recent sensor telemetry (moisture, temp, humidity, pH)
  ├── PostgreSQL: load IoT devices, yield comparisons, predictions, sensor history
  ├── Build context string from all collected data
  │
  ▼
LLM (Ollama / OpenAI-compatible)
  ├── Tool loop (up to 5 rounds):
  │     LLM may call trigger_iot_device → irrigate / capture image / activate sensor
  └── Returns structured JSON health report
  │
  ▼
PostgreSQL (saved as cascade)
  FarmHealth → CropFieldHealth
            → DiseaseAlert
            → HealthAlert
            → SensorHistoryPoint
            → YieldComparison
```

### 2. Prediction Pipeline

```
User calls generateFarmPredictions(farmId)
  │
  ▼
PredictionService
  ├── Validate: farm has images, weekly quota not exceeded
  ├── Increment PredictionRange.regeneration_count
  └── Enqueue "create-predictions" → "prediction-queue"
  │
  ▼
PredictionConsumer (BullMQ worker)
  ├── Load farm images with GPS coordinates
  ├── Map growth stage enum to text (germination / vegetative / flowering / fruiting / maturation)
  ├── POST to PREDICTION_BASE_URL/predict?verbose=true
  │     Body: { crop, soil_type, growth_stage, subplots[], farm_metadata }
  └── Derive risk levels from response:
        Disease: predicted_class + severity threshold
        Yield:   water_stress_pct thresholds
  │
  ▼
PostgreSQL
  Delete previous week's predictions → Insert new Prediction rows
```

### 3. Chat Pipeline

```
User sends message (GraphQL mutation)
  │
  ▼
ChatService
  ├── Create Chat record (if new conversation)
  ├── Save user ChatMessage (role: USER)
  └── Enqueue "process-chat-message" → "chat-queue"
  │
  ▼
ChatConsumer (BullMQ worker)
  └── Load full message history from DB
  │
  ▼
ClaudeService.streamAndProcess()
  ├── Build system prompt from farm context
  ├── Tool loop (up to 5 rounds):
  │     get_farm_health / get_predictions / get_iot_devices
  │     get_farm_details / trigger_iot_device
  └── Stream tokens → ChatPubSubService (Redis PubSub)
  │
  ▼
SSE Endpoint (GET /api/chat/:chatId/stream)
  └── Pushes token / tool_use / done / error events to client
  │
  ▼
PostgreSQL
  Save assistant ChatMessage (role: ASSISTANT, raw_blocks: JSON)
```

---

## API Design

**GraphQL (primary)**
- Apollo Server v5, code-first schema generation via `@nestjs/graphql`
- All queries and mutations protected by `GqlJwtAuthGuard` (JWT in `Authorization: Bearer` header)
- File uploads via `graphql-upload-ts` (multipart form)
- Subscriptions not used — real-time delivery uses SSE instead

**REST (secondary)**
- `POST /api/payment/webhook` — Paystack webhook (HMAC-SHA512 signature verified)
- `POST /api/iot/webhook` — AWS IoT Jobs result callback (`x-iot-secret` header)
- `GET /api/farm/:farmId/iot/stream` — SSE stream for IoT device events
- `GET /v1/auth/google/callback` — Google OAuth redirect
- `GET /api/farm/:farmId/iot/:deviceId/download` — ZIP bundle of device certificates

---

## Queue System

All queues use **BullMQ** backed by Redis.

| Queue | Producer | Consumer | Job Type |
|---|---|---|---|
| `health-queue` | `HealthProducer` | `HealthConsumer` | `compute-health-batch` |
| `prediction-queue` | `PredictionProducer` | `PredictionConsumer` | `create-predictions` |
| `chat-queue` | `ChatProducer` | `ChatConsumer` | `process-chat-message` |
| `email` | `EmailProducer` | `EmailProcessor` | `send-magic-link`, `send-welcome` |
| `farm-data-queue` | `FarmDataProducer` | `FarmDataConsumer` | `generate-farm-data` |

Workers are long-running processes started alongside the main app. Queues handle retries, backoff, and concurrency limits automatically.

---

## Database Schema Overview

**Database:** PostgreSQL 17  
**ORM:** TypeORM 0.3 (migrations-based, auto-run on startup)  
**Total entities:** 22

```
Farmer (1) ──── (1) FarmerSettings
  │
  └── (many) Farm
        ├── (many) Coordinate
        ├── (many) ImageData
        ├── (many) IotDevice
        │     └── (many) IotToolCall
        ├── (many) Prediction
        ├── (many) PredictionRange
        │     └── (many) ImageData  [range_images]
        └── (many) FarmHealth
              ├── (many) CropFieldHealth
              ├── (many) DiseaseAlert
              ├── (many) HealthAlert
              ├── (many) SensorHistoryPoint
              └── (many) YieldComparison

Chat (many) ──── (many) Farmer
  └── (many) ChatMessage

FarmerSubscription (many) ──── (1) Farmer
  └── (1) SubscriptionPlan

PaymentTransaction (many) ──── (1) Farmer
  └── (1) FarmerSubscription [nullable]

MagicLinkToken (many) ──── (email, not FK)
RefreshToken   (many) ──── (farmerId, not FK)
```

Sensor telemetry is **not** stored in PostgreSQL — raw device readings go to **AWS DynamoDB** (`farm_telemetry` table) and are only read during health computation.

---

## Real-time Streaming

Two SSE endpoints deliver live updates:

**IoT Device Events** (`GET /api/farm/:farmId/iot/stream`)
- JWT passed as query param `?token=`
- `IotPubSubService` subscribes to a Redis channel per farm
- Events: device status changes, tool call results, sensor readings

**Chat Token Streaming** (`GET /api/chat/:chatId/stream`)
- `ChatPubSubService` subscribes to a Redis channel per chat session
- Events: `token` (partial text), `tool_use` (function call), `done`, `error`
- Clients reconstruct the full response by concatenating token events

Both endpoints handle `AbortSignal` for clean disconnection when the client closes the connection.

---

## Infrastructure Components

| Component | Role | Config |
|---|---|---|
| **PostgreSQL 17** | Primary relational store — all business data | `DATABASE_URL` |
| **Redis** | BullMQ job queues + PubSub message bus + dashboard cache | `REDIS_URL` |
| **AWS DynamoDB** | Time-series telemetry from IoT devices (`farm_telemetry` table) | `DYNAMODB_*` |
| **AWS IoT Core** | Device registry, certificate authority, job dispatch | `IOT_*` |
| **Cloudflare R2** | Object storage for farm images, documents, device cert bundles | `S3_*` |
| **Ollama** | Local LLM runtime; OpenAI-compatible API; any GGUF model | `OLLAMA_*` |
| **Python ML Service** | External computer vision service for disease and yield predictions | `PREDICTION_BASE_URL` |
