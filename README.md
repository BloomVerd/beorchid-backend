# BeOrchid Backend

**AI-Powered Precision Agriculture for Africa**

[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-red)](https://nestjs.com)
[![GraphQL](https://img.shields.io/badge/GraphQL-Apollo_5-pink)](https://apollographql.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-Proprietary-lightgrey)](#license)

---

## Overview

BeOrchid is a full-stack agritech backend that gives African farmers access to agronomist-level intelligence through their smartphones. It combines IoT sensor networks, computer vision disease and yield predictions, and LLM-driven farm health analysis into a single, unified API.

The system monitors farms autonomously — collecting telemetry, running AI health assessments every few hours, triggering irrigation or image capture automatically when conditions require it, and surfacing actionable alerts so farmers can intervene before losses occur.

See [`ai/docs/`](ai/docs/) for deeper technical and business documentation.

---

## Key Features

- **Automated AI Health Monitoring** — scheduled pipeline collects IoT telemetry and asks an LLM to score soil, crop, disease risk, and weather stress; results stored and alerted automatically
- **Agentic IoT Control** — the LLM can autonomously trigger irrigation, image capture, and sensor activation based on field conditions
- **Conversational AI Assistant** — multi-turn chat with 5 farm tools (health, predictions, devices, details, IoT commands), streamed token by token to the client
- **Disease & Yield Predictions** — external computer vision service analyzes geotagged field photos and returns risk levels (LOW / MODERATE / HIGH)
- **IoT Device Management** — AWS IoT Core integration for provisioning sensors, weather stations, drones, irrigation controllers with full X.509 certificate lifecycle; each device stores optional GPS coordinates (`lat`/`lon`) used by the prediction pipeline
- **Subscription Tiers** — Free / Popular / Premium plans enforced server-side, paid via Paystack
- **Real-time Streaming** — Server-Sent Events (SSE) for live IoT events and AI chat token streams
- **Cloud File Storage** — Cloudflare R2 (S3-compatible) with presigned upload URLs and CDN delivery
- **Multi-Channel Notifications** — prediction alerts delivered via in-app SSE stream, email, and SMS (Twilio); each channel toggled per-farmer in settings

---

## Architecture Overview

```
┌──────────────┐
│   Client App  │  (mobile / web)
└──────┬───────┘
       │ GraphQL (Apollo Server v5)
       │ REST (auth, IoT webhooks, SSE)
┌──────▼────────────────────────────────┐
│           NestJS Application           │
│  Auth · Farmer · Farm · Health         │
│  Predictions · Chat · Payment          │
│  Email · FarmData · Upload             │
│  Notifications · SMS                   │
└──────┬────────────────────────────────┘
       │ BullMQ Jobs
┌──────▼──────────────────────────────────────────┐
│                  Workers                         │
│  HealthConsumer  PredictionConsumer              │
│  ChatConsumer    EmailProcessor                  │
│  FarmDataConsumer                                │
└──────┬──────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│               Infrastructure                     │
│  PostgreSQL 17   Redis    DynamoDB               │
│  AWS IoT Core    Cloudflare R2                   │
│  Ollama / LLM    Prediction ML Service           │
│  Twilio (SMS)                                    │
└─────────────────────────────────────────────────┘
```

---

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| Node.js | ≥ 22 |
| npm | ≥ 10 |
| Docker & Docker Compose | Any recent version |
| PostgreSQL | 17 (can use Docker) |
| Redis | Latest (can use Docker) |
| AWS account | IoT Core + DynamoDB |
| Cloudflare R2 | Or any S3-compatible storage |
| Paystack account | For payment processing |
| Ollama | Local LLM runtime (or set `OLLAMA_BASE_URL` to a hosted endpoint) |
| Gmail App Password | For transactional email |

---

## Quick Start (Docker)

The fastest way to run the full stack locally:

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd beorchid-backend

# 2. Copy environment template and fill in your secrets
cp .env.example .env

# 3. Start PostgreSQL + Redis + the application
docker-compose up -d

# 4. (Optional) Start a local Ollama LLM service
docker-compose -f docker-compose.ollama.yml up -d
```

The API will be available at `http://localhost:4000/graphql`.

---

## Manual Local Setup

If you prefer to run the app directly (requires Postgres and Redis already running):

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your values (see table below)

# 3. Start supporting services (skip if already running)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17
docker run -d -p 6379:6379 redis:latest

# 4. Run database migrations
npm run migration:run

# 5. Start in development mode (hot reload)
npm run start:dev
```

---

## Environment Variables

Copy `.env.example` to `.env` and supply values for your environment.

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP port the server listens on |
| `STAGE` | — | `development` or `production` |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |
| `CORS_ORIGIN` | — | Additional CORS origin (optional) |

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | Full PostgreSQL connection string |
| `DB_USERNAME` | `postgres` | Database username |
| `DB_PASSWORD` | `postgres` | Database password |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `beorchid-db` | Database name |
| `DB_NAME_TEST` | `beorchid-test-db` | Test database name |

### Redis

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection string, e.g. `redis://default:password@localhost:6379` |

### Auth / JWT

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret used to sign JWT access tokens |

### Google OAuth

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI (e.g. `http://localhost:4000/v1/auth/google/callback`) |

### Cloudflare R2 (file storage)

| Variable | Description |
|---|---|
| `S3_REGION` | `auto` for Cloudflare R2 |
| `S3_ENDPOINT` | R2 endpoint, e.g. `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | R2 access key |
| `S3_SECRET_ACCESS_KEY` | R2 secret key |
| `S3_BUCKET_PUBLIC` | Public bucket name (images served via CDN) |
| `S3_BUCKET_PRIVATE` | Private bucket name (documents, certs) |
| `S3_CDN_URL` | CDN base URL, e.g. `https://<public-id>.r2.dev` |

### AWS IoT Core

| Variable | Description |
|---|---|
| `IOT_REGION` | AWS region for IoT Core, e.g. `us-east-1` |
| `IOT_ACCESS_KEY_ID` | AWS access key with IoT permissions |
| `IOT_SECRET_ACCESS_KEY` | AWS secret key |

### AWS DynamoDB (telemetry)

| Variable | Description |
|---|---|
| `DYNAMODB_REGION` | AWS region for DynamoDB |
| `DYNAMODB_ACCESS_KEY_ID` | AWS access key with DynamoDB permissions |
| `DYNAMODB_SECRET_ACCESS_KEY` | AWS secret key |

### Email

| Variable | Description |
|---|---|
| `GMAIL_USER` | Gmail address for sending transactional email |
| `GMAIL_APP_PASSWORD` | Gmail app password (not your account password) |
| `EMAIL_FROM` | From address shown to recipients |
| `EMAIL_HOST` | SMTP host (`smtp.gmail.com` in production, `smtp.ethereal.email` in dev) |

### SMS (Twilio)

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID (`ACxxx…`) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio phone number to send from (E.164 format, e.g. `+1234567890`) |

All three are optional — if omitted, SMS notifications are silently skipped.

### Ollama / LLM

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama or OpenAI-compatible LLM endpoint |
| `OLLAMA_API_KEY` | `ollama` | API key (use `ollama` for local Ollama) |
| `OLLAMA_MODEL` | `llama3.2` | Model name to use |
| `OLLAMA_VERSION` | `latest` | Docker image tag for the Ollama service |
| `OLLAMA_KEEP_ALIVE` | `24h` | How long Ollama keeps the model loaded |
| `OLLAMA_MAX_LOADED_MODELS` | `1` | Maximum concurrently loaded models |

### Prediction Service

| Variable | Default | Description |
|---|---|---|
| `PREDICTION_BASE_URL` | `http://localhost:8000` | URL of the external Python ML prediction service |

### Paystack

| Variable | Description |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack secret key (`sk_test_...` or `sk_live_...`) |

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Development mode with hot reload |
| `npm run start:debug` | Debug mode with hot reload |
| `npm run start:prod` | Run compiled production build |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run format` | Run Prettier formatter |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:cov` | Unit tests with coverage report |
| `npm run test:e2e` | End-to-end tests |
| `npm run migration:generate` | Generate a new migration from entity changes |
| `npm run migration:run` | Apply pending migrations |
| `npm run migration:revert` | Revert the most recent migration |
| `npm run migration:show` | List migrations and their status |

---

## Database Migrations

The project uses TypeORM migrations. Migrations run automatically on application startup (`migrationsRun: true`). For manual control:

```bash
# Apply all pending migrations
npm run migration:run

# Generate a new migration after changing entities
npm run migration:generate --name=DescriptiveName

# Undo the last applied migration
npm run migration:revert
```

Migration files live in `src/database/migrations/`.

---

## Infrastructure as Code

The `iac/` directory contains a **Terraform** configuration that provisions the full AWS deployment stack:

| Resource | Details |
|---|---|
| VPC | Public + private subnets, NAT gateway, internet gateway |
| App EC2 (`t3.medium`) | Runs the backend via Docker Compose; public subnet |
| Ollama EC2 (`g4dn.xlarge`) | GPU instance (NVIDIA T4) in private subnet for LLM inference |
| DynamoDB | `farm_telemetry` table with TTL for IoT telemetry |
| AWS IoT Core | Topic rule routing `farms/+/+/telemetry` → Lambda |
| Lambda | Python 3.12 function writing IoT events to DynamoDB |
| SSM Parameter Store | Stores the full `.env` file; fetched by EC2 at boot |
| GitHub Secrets | Auto-updates `EC2_IP` and `OLLAMA_IP` after apply |

### Deploy

```bash
cd iac
terraform init
terraform apply \
  -var="public_key=$(cat ~/.ssh/id_rsa.pub)" \
  -var="env_file_content=$(cat ../.env)" \
  -var="github_repo=bloomverd/beorchid-backend"
```

Terraform state is stored in S3 (`beorchid-bucket`). Requires Terraform ≥ 1.6.0 and AWS CLI credentials with IoT Core, EC2, DynamoDB, Lambda, SSM, and IAM permissions.

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests (watch mode)
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

## Further Documentation

| Document | Description |
|---|---|
| [`ai/docs/architecture.md`](ai/docs/architecture.md) | System architecture, module breakdown, data flows, database schema |
| [`ai/docs/ai-integration.md`](ai/docs/ai-integration.md) | AI/LLM integration details, health pipeline, chat tools, predictions |
| [`ai/docs/business-potential.md`](ai/docs/business-potential.md) | African market opportunity, revenue model, growth strategy |
| [`ai/docs/iot-aws-setup-cli.md`](ai/docs/iot-aws-setup-cli.md) | AWS IoT Core setup via CLI |
| [`ai/docs/iot-aws-setup-console.md`](ai/docs/iot-aws-setup-console.md) | AWS IoT Core setup via AWS Console |

---

## License

This software is **proprietary and unlicensed**. All rights reserved by the BeOrchid / Bloomverd team. Unauthorized copying, distribution, or use is prohibited.
