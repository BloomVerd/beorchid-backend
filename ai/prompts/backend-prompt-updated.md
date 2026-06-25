# Backend Build Prompt — AgriMarket & Investment Platform (System 2)

You are a senior backend engineer. Build the backend for a second platform that sits
on top of an existing **precision farming system (System 1)**. This document is your
brief: implement the data model, business logic, and HTTP API described below.

Read the whole document before writing code. Where something is marked
**[DECISION]**, an assumption has been made for you — confirm or change it, but do not
silently ignore it.

---

## 1. Context

**System 1 (already built — do NOT rebuild it):**
- Farmers create farms.
- Farms hold coordinates, drone-view images tied to coordinates, IoT sensors &
  actuators, and raw farm data.
- AI generates predictions/insights from images + sensor data.
- A **farm health** score is derived from predictions + sensors.
- Notifications are sent to farmers, including actuator/tool-call actions.

**System 2 (what you are building) — a marketplace + agri-fintech layer:**
- View crop **market trends** for popular crops (e.g. 2 years of maize prices + forecast).
- Farmers **list their farm for sale** (a "bid", e.g. "1 acre maize farm, 4000 GHS").
- Companies/individuals **make offers** on those listings; farmers see and respond.
- **Market survey insights** — a richer expansion of trends.
- Multiple **roles**: individual, company, super_admin (+ farmer — see below).
- super_admin creates **investment plans** (e.g. "buy 2-acre maize farm @ 1000 GHS,
  expect 100–200 GHS profit after 6 months"); other roles view and buy them.
- super_admin creates **platform coins** (maize coin, rice coin) whose price tracks
  crop trends; users buy, hold, and cash out any time for profit/loss.

### Field data collection
In addition to IoT sensors and drone imagery from System 1, the platform supports
**ground-truth field collection**: agents or agronomists physically visit farms, take
measurements, and log observations (crop condition, pest presence, moisture levels,
yield estimates, etc.). This data flows directly into `MarketPricePoint` history and
`MarketSurveyInsight` records and may feed the coin pricing engine. Super admins also
have a dedicated data-injection interface to load historical and real-time price data
from any authoritative source (ministry records, commodity exchanges, manual surveys).

### Critical integration & scope decisions
- **[DECISION] Shared identity.** System 1 and System 2 share one user/auth store
  (single sign-on). A user authenticated in System 1 is the same principal here.
  If System 1 owns auth, this service validates its tokens / reads from a shared
  user table; do not create a second password store.
- **[DECISION] Roles & two front-ends.** The platform has four roles: `farmer`,
  `individual`, `company`, `super_admin`. **There are two separate front-ends sharing
  this backend:** (a) the existing **Bloomverd farming app**, used by farmers, and
  (b) the new **AgriMarket investor/company app** (the UI being designed now), used by
  individual/company/super_admin. A user may hold multiple roles. The marketplace data
  (listings, offers, deals) lives in *this* backend, but the **farmer-facing actions on
  it** — creating a listing, accepting/countering/rejecting offers as the seller — are
  consumed by the Bloomverd app, **not** the investor UI. Keep the `farmer` role and its
  endpoints here; just know the investor UI never renders farmer/seller screens.
- **[DECISION] Farms are owned by System 1.** This service does **not** store
  coordinates, drone images, sensor data, or compute health. It references a
  `farm_id` and reads farm summary + health via System 1's API (or a shared
  read-replica / events). Never duplicate that data; cache a denormalized snapshot
  for listings if needed.
- **[DECISION] This is a financial product.** Coins and investment plans are
  investment instruments and farm sales move real money. Treat money with the rigor
  in §8. Add a short note in the README that coins/investments may be regulated
  securities in some jurisdictions and need legal review before going live — do not
  build "guaranteed return" language into the API.

---

## 2. Recommended stack

**[DECISION] Match System 1's stack first.** If System 1 is Node/TypeScript, use
NestJS; if Python, use FastAPI or Django REST. If greenfield, default to:

- **Runtime/framework:** Node.js + TypeScript + NestJS (modular, DI, guards for RBAC).
- **DB:** PostgreSQL. Use `numeric`/`bigint` for money (integer minor units — see §8),
  `jsonb` for flexible payloads (trend metadata, forecasts), and **TimescaleDB**
  (or a partitioned table) for time-series price points.
- **Cache / queues:** Redis. Background jobs via BullMQ (price recompute, forecasts,
  settlement, notification fan-out).
- **Auth:** JWT access + refresh, or validate System 1's tokens. RBAC via guards.
- **Migrations:** versioned (Prisma/TypeORM/Knex). No schema changes outside migrations.
- **Payments:** Ghana-first — Paystack or Flutterwave (cards + MTN/Telecel Mobile
  Money). Abstract behind a `PaymentProvider` interface so it's swappable.
- **Observability:** structured logs, request IDs, audit log table, metrics.

Adapt freely, but keep: relational store for money, a job runner for scheduled
recomputation, and a payment abstraction.

---

## 3. Roles & permission matrix

Implement RBAC enforced at the route + resource level (not just UI).

| Capability | farmer | individual | company | super_admin | field_agent* |
|---|---|---|---|---|---|
| View market trends & survey insights | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/manage farm listings (own farms) | ✓ | – | – | ✓ | – |
| View farm listings | ✓ | ✓ | ✓ | ✓ | ✓ |
| Make/withdraw offers on listings | – | ✓ | ✓ | ✓ | – |
| Accept / counter / reject offers (own listing) | ✓ | – | – | ✓ | – |
| View investment plans | ✓ | ✓ | ✓ | ✓ | – |
| Buy investment units | ✓ | ✓ | ✓ | ✓ | – |
| Create/edit/settle investment plans | – | – | – | ✓ | – |
| View coins | ✓ | ✓ | ✓ | ✓ | – |
| Buy/sell coins | ✓ | ✓ | ✓ | ✓ | – |
| Create coins / set pricing weights | – | – | – | ✓ | – |
| Submit field observations | – | – | – | ✓ | ✓ |
| Review / approve field observations | – | – | – | ✓ | – |
| Inject market data (single/bulk/feed) | – | – | – | ✓ | – |
| Manage external data feeds | – | – | – | ✓ | – |
| Manage market data / publish forecasts | – | – | – | ✓ | – |
| Wallet (deposit/withdraw/ledger) | ✓ | ✓ | ✓ | ✓ | – |
| User & role management, moderation | – | – | – | ✓ | – |

\* `field_agent` is a **capability flag** granted to an `individual` or `company` user
by super_admin, not a standalone role. A user can be `individual + field_agent`. Their
base role governs marketplace/wallet access; the flag unlocks the `/field/observations`
endpoints.

`company` accounts may have multiple member users — **[DECISION]** model an
`Organization` with members and a per-org wallet, where company users act on behalf of
the org. If you want to keep v1 simple, make company a flag on the user and add orgs
later (note the choice).

---

## 4. Data model

Use UUID PKs, `created_at`/`updated_at`, soft-delete where it aids auditing. Money
fields are integer minor units (pesewas) with an explicit `currency` (default `GHS`).

### Identity (shared / referenced)
- **User** — `id`, `name`, `email`, `phone`, `status`. Auth may live in System 1.
- **UserRole** — `user_id`, `role` (`farmer|individual|company|super_admin`). Many-to-many.
- **Organization** *(optional v1)* — `id`, `name`, `kyc_status`, `owner_user_id`.
- **OrganizationMember** — `org_id`, `user_id`, `member_role`.

### Farm reference (owned by System 1)
- **FarmRef** — `id` (mirror of System 1 `farm_id`), `owner_user_id`, `crop`,
  `acreage`, `region`, `latest_health_score`, `snapshot` (jsonb: thumbnails/summary),
  `synced_at`. Populated via System 1 API/events; treated as read-mostly cache.

### Marketplace — listings, offers, deals
- **Listing** — `id`, `farm_id`(→FarmRef), `seller_id`, `crop`, `acreage`, `region`,
  `asking_price`, `currency`, `description`, `status`
  (`draft|open|under_offer|accepted|sold|withdrawn|expired`), `expires_at`.
- **Offer** — `id`, `listing_id`, `buyer_id`, `amount`, `currency`, `message`,
  `status` (`pending|countered|accepted|rejected|withdrawn|expired`),
  `parent_offer_id` (for counter-offers → negotiation thread), `expires_at`.
- **Deal** — `id`, `listing_id`, `accepted_offer_id`, `seller_id`, `buyer_id`,
  `amount`, `status` (`pending_payment|in_escrow|completed|cancelled|disputed`),
  `escrow_ledger_ref`. Ownership transfer is off-platform; track status + documents.

**Offer state machine:** `pending → (countered → pending) | accepted | rejected | withdrawn | expired`.
Accepting an offer sets the listing to `accepted`, auto-rejects other open offers on
that listing, and creates a `Deal`.

### Field data collection
- **FieldObservation** — `id`, `crop_id`, `region`, `observed_at`, `observed_price`,
  `price_type` (`farm_gate|wholesale|retail|auction`), `quantity_available`, `quality_grade`,
  `source_note`, `agent_id`, `agent_device_id`, `attachment_urls` (text[]),
  `condition_tags` (text[]), `confidence` (`low|medium|high`),
  `status` (`submitted|under_review|approved|rejected`), `reviewed_by`, `review_note`,
  `reviewed_at`, `market_price_point_id`. Full detail in §7.3.1.
- **FieldAgentCapability** — `user_id`, `granted_by`, `granted_at`, `revoked_at`.
  Tracks which users hold the `field_agent` capability.

### Data ingestion
- **DataIngestionJob** — `id`, `type` (`csv_upload|json_upload|external_feed_run|
  forecast_import`), `feed_id`, `submitted_by`, `status`
  (`pending|processing|completed|failed|partial`), `row_count`, `processed_count`,
  `skipped_count`, `error_count`, `errors` (jsonb), `storage_ref`, `started_at`,
  `completed_at`. Tracks bulk upload jobs. Full detail in §7.3.2.
- **ExternalFeed** — `id`, `name`, `url`, `format` (`json|csv`), `field_map` (jsonb),
  `crop_id`, `region`, `price_type`, `source_label`, `schedule_cron`, `is_active`,
  `last_run_at`, `last_run_status`, `created_by`. Registered external data feeds polled
  on a schedule. Full detail in §7.3.2.

### Market data — trends, surveys, forecasts
- **Crop** — `id`, `name` (maize, rice…), `slug`, `unit` (e.g. per 100kg bag), `metadata` jsonb.
- **MarketPricePoint** — `crop_id`, `region`, `price`, `currency`, `observed_at`,
  `source`, `source_url`, `price_type` (`farm_gate|wholesale|retail|auction|index`),
  `volume_kg`, `quality_grade`, `notes`, `ingestion_job_id` (→DataIngestionJob, nullable),
  `field_observation_id` (→FieldObservation, nullable), `is_superseded` (bool; set when
  a correction replaces this row), `superseded_by` (→MarketPricePoint, nullable).
  Time-series; the backbone of trend charts (2y history etc.).
- **PriceForecast** — `crop_id`, `region`, `horizon` (e.g. 30/90/180d), `predicted_price`,
  `confidence_low`, `confidence_high`, `model_version`, `generated_at`. Sourced from
  System 1's AI or an internal model; super_admin can publish/override.
- **MarketSurveyInsight** — `id`, `crop_id`/`region` (nullable for global), `type`
  (`supply_demand|seasonality|volatility|regional_comparison|top_crops|report`),
  `payload` jsonb, `published_at`, `author_id`. The "expanded" survey layer.

### Investments
- **InvestmentPlan** — `id`, `crop_id`, `title`, `acreage`, `unit_cost`,
  `expected_profit_min`, `expected_profit_max`, `maturity_days` (or `maturity_date`),
  `total_units`, `units_remaining`, `risk_notes`, `status`
  (`draft|open|closed|matured|settled`), `created_by`.
- **InvestmentPurchase** (position) — `id`, `plan_id`, `investor_id`, `units`,
  `principal` (= units × unit_cost at purchase), `status`
  (`active|matured|settled|cancelled`), `purchased_at`, `matures_at`,
  `payout_amount` (set at settlement), `settlement_ledger_ref`.
- **InvestmentSettlement** — `id`, `plan_id`, `actual_profit_per_unit`,
  `settled_by`, `settled_at`, `notes`. super_admin records the real harvest outcome;
  payout per position = `principal + units × actual_profit_per_unit` (may be ≤ principal;
  see §7.2).

### Platform coins
- **Coin** — `id`, `name` (Maize Coin), `symbol` (MAIZ), `crop_id`, `base_price`,
  `current_price`, `circulating_supply` (nullable/uncapped — **[DECISION]** v1 treats
  coins as a synthetic price index minted/burned on buy/sell, not fixed-supply),
  `pricing_weights` jsonb, `status` (`draft|active|paused|delisted`), `created_by`.
- **CoinPricePoint** — `coin_id`, `price`, `computed_at`, `inputs` jsonb (audit of the
  factors used). Drives the coin chart.
- **CoinHolding** — `user_id`, `coin_id`, `units`, `avg_cost`. (Or derive from ledger.)
- **CoinTransaction** — `id`, `user_id`, `coin_id`, `side` (`buy|sell`), `units`,
  `unit_price`, `gross_amount`, `fee`, `executed_at`, `ledger_ref`.

### Wallet & ledger (see §8)
- **Wallet** — `id`, `owner_type` (`user|org`), `owner_id`, `currency`,
  `available_balance`, `locked_balance`.
- **LedgerEntry** — double-entry: `id`, `transaction_id`, `wallet_id`, `direction`
  (`debit|credit`), `amount`, `account` (`user_cash|escrow|platform_fee|coin_pool|
  investment_pool|external`), `created_at`. Entries for one `transaction_id` must net to zero.
- **PaymentIntent** — `id`, `wallet_id`, `provider`, `provider_ref`, `type`
  (`deposit|withdrawal`), `amount`, `status`, `idempotency_key`.

### Engagement
- **Watchlist** / **SavedSearch** — let users follow a crop, coin, plan, or listing
  filter and get alerts.
- **Notification** — reuse System 1's notification service. Define event types in §9.
- **AuditLog** — `actor_id`, `action`, `entity`, `entity_id`, `diff` jsonb, `created_at`
  for every admin action and money movement.

---

## 5. API surface (REST, versioned `/api/v2`)

Conventions: JSON, JWT auth, RBAC guards, cursor or page/limit pagination, consistent
filtering (`?crop=`, `?region=`, `?status=`, `?from=`, `?to=`), envelope with
`data`/`meta`, RFC-7807-style errors, idempotency keys on all money-moving POSTs.

### Auth & profile
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` *(or delegate to System 1)*
- `GET /me`, `PATCH /me`, `GET /me/roles`

### Market trends & insights
- `GET /crops`
- `GET /crops/:id`
- `GET /crops/:id/prices?region=&from=&to=&interval=` → historical series (2y etc.)
- `GET /crops/:id/forecast?region=&horizon=` → forecast + confidence band
- `GET /market/insights?type=&crop=&region=` → survey insights
- `GET /market/insights/:id`
- `GET /market/top-crops`

### Listings (farm bids) & offers
> Seller-side endpoints below (create listing, accept/counter/reject as seller) are
> consumed by the **separate Bloomverd farmer app**. Buyer-side endpoints (browse, make
> offer, accept a seller's counter, withdraw) are consumed by the **investor UI**.

- `GET /listings` (filterable, map-friendly: returns coords + health snapshot) — *both UIs*
- `POST /listings` *(farmer; must own the farm_id in System 1)* — *Bloomverd app*
- `GET /listings/:id` — *both UIs*
- `PATCH /listings/:id`, `POST /listings/:id/withdraw` — *farmer / Bloomverd app*
- `GET /listings/:id/offers` *(seller or super_admin)* — *Bloomverd app / admin*
- `POST /listings/:id/offers` *(individual/company — make an offer)* — *investor UI*
- `GET /offers/mine` *(buyer's sent offers)* — *investor UI*
- `POST /offers/:id/counter` — *either party*; `/accept` — *either party (buyer accepts a
  seller counter, seller accepts a buyer offer)*; `/reject` — *seller*; `/withdraw` — *offer owner*
- `GET /deals/mine`, `GET /deals/:id`, `POST /deals/:id/confirm-payment`

### Investments
- `GET /investments` (open plans, filterable)
- `GET /investments/:id`
- `POST /investments` *(super_admin)* — create plan
- `PATCH /investments/:id`, `POST /investments/:id/close`
- `POST /investments/:id/purchase` *(any role; body: units; debits wallet)*
- `POST /investments/:id/settle` *(super_admin; records actual profit, triggers payouts)*
- `GET /me/investments` — my positions, maturity countdowns, settled returns

### Coins
- `GET /coins`
- `GET /coins/:id`
- `GET /coins/:id/prices?from=&to=` — coin price history
- `POST /coins` *(super_admin)*, `PATCH /coins/:id`, `POST /coins/:id/recompute-price`
- `POST /coins/:id/buy`, `POST /coins/:id/sell` *(units; wallet debit/credit; idempotent)*
- `GET /me/coins` — holdings + unrealized P/L

### Wallet
- `GET /me/wallet`
- `POST /me/wallet/deposits` → returns provider checkout/PaymentIntent
- `POST /me/wallet/withdrawals`
- `GET /me/wallet/ledger?from=&to=&type=`
- `POST /webhooks/payments/:provider` *(verify signature; idempotent; advances PaymentIntent)*

### Engagement
- `GET/POST/DELETE /me/watchlist`, `GET/POST /me/saved-searches`
- `GET /me/notifications`, `POST /me/notifications/:id/read`

### Super admin
- `GET /admin/users`, `PATCH /admin/users/:id/roles`, `POST /admin/users/:id/suspend`
- `GET /admin/deals`, `GET /admin/offers` (moderation/oversight)
- `POST /admin/insights`, `POST /admin/forecasts` (publish)
- `GET /admin/metrics` (platform KPIs: GMV, AUM, coin volume, active investments)
- `GET /admin/audit-log`

---

## 6. Coin pricing engine (specify, don't guess)

A coin's price is a transparent, auditable function of its crop's market data — **not**
random. Make it deterministic and store inputs in `CoinPricePoint.inputs`.

**[DECISION] Default formula** (super_admin tunes `pricing_weights`):

```
price = base_price × (1
        + w_trend  × normalized_price_change        # crop price momentum vs lookback window
        + w_demand × demand_factor                  # from survey supply/demand insight, in [-1, 1]
        + w_health × normalized_avg_farm_health      # avg health of farms growing this crop (System 1), centered
        + w_vol    × volatility_adjustment)          # optional dampener
```

- Each factor is normalized to a bounded range; clamp the final multiplier (e.g.
  0.25×–4× base) so price can't explode or go ≤ 0.
- Weights `w_*` and lookback windows are stored per coin and editable by super_admin;
  log every change to AuditLog.
- **Recompute on a schedule** (e.g. hourly/daily job) **and** on new `MarketPricePoint`
  for that crop. Append a `CoinPricePoint`; never mutate history.
- Buy/sell execute at the latest computed price (optionally with a small spread/fee).
  Persist the exact `unit_price` on each `CoinTransaction`.
- Cashing out = `sell`: credit wallet `units × current_price − fee`. Allowed any time
  while coin is `active`; block when `paused`/`delisted` (define behaviour for delist:
  forced settlement at last price).

---

## 7. Other core business logic

### 7.1 Listings & offers
- A farmer can only list a farm they own in System 1 (verify via FarmRef/System 1 API).
- Accepting an offer: atomically set offer `accepted`, listing `accepted`, auto-reject
  other open offers, create a `Deal`, notify all parties.
- Counter-offer creates a new Offer with `parent_offer_id`, flips the previous to
  `countered` — builds a negotiation thread.
- Offers and listings expire via a scheduled job.

### 7.2 Investments
- Purchase: validate `units ≤ units_remaining`, lock/debit `units × unit_cost` from
  wallet into `investment_pool`, decrement `units_remaining`, create position with
  `matures_at = now + maturity_days`.
- Settlement (super_admin): record `actual_profit_per_unit` (can be negative — do NOT
  promise guaranteed returns). For each active position on the plan, compute
  `payout = principal + units × actual_profit_per_unit`, credit investor wallet,
  write ledger entries, set position `settled`, notify investor.
- Expose expected range (`min`/`max`) as **projection only**; never label as guaranteed.

### 7.3 Market data ingestion

#### 7.3.1 Field agent data collection
Ground agents (agronomists, field officers, cooperative representatives) collect crop
data in person. They authenticate with a scoped `field_agent` capability (a sub-role
granted by super_admin to any `individual` or `company` user, or a dedicated internal
role). Their submissions go through a lightweight **FieldObservation** flow:

**What field agents collect per observation:**
- `crop_id` and `region` — the crop and district/area observed.
- `observed_at` — exact datetime of observation (may be backdated if logged offline).
- `observed_price` — price per unit (e.g. per 100 kg bag) in GHS pesewas.
- `price_type` — `farm_gate | wholesale | retail | auction` (required; drives how the
  data is weighted in trend computation).
- `quantity_available` — estimated stock or volume in kg (optional; feeds supply/demand
  insight).
- `quality_grade` — `A | B | C | ungraded` (optional; noted but not mixed into the
  price series without the grade filter).
- `source_note` — free text: market name, cooperative, GPS location of the market or
  field, name of trader interviewed, etc. (required; drives data credibility).
- `agent_device_id` — device or app identifier for audit.
- `attachments` — up to 5 images (JPEG/PNG ≤ 5 MB each); stored in object storage,
  reference URLs logged. These can show market boards, crops, or conditions.
- `condition_tags` — multi-select: `pest_presence | drought_stress | flood_damage |
  bumper_harvest | normal` (optional; surfaced in survey insights).
- `confidence` — `low | medium | high` (self-rated; low-confidence observations are
  stored but not promoted into the main trend series without admin review).

**FieldObservation state machine:** `submitted → (under_review) → approved | rejected`.
- `confidence: high` from a verified agent auto-approves and creates a `MarketPricePoint`.
- `confidence: medium | low` lands in a review queue; super_admin approves/rejects, optionally
  adjusting the value before it enters the series.
- Rejection stores the reason; the agent is notified.

**FieldObservation entity (new table):**
```
FieldObservation {
  id                UUID PK
  crop_id           → Crop
  region            varchar
  observed_at       timestamptz
  observed_price    bigint (pesewas)
  price_type        enum(farm_gate|wholesale|retail|auction)
  quantity_available numeric nullable
  quality_grade     enum(A|B|C|ungraded) nullable
  source_note       text
  agent_id          → User
  agent_device_id   varchar nullable
  attachment_urls   text[]
  condition_tags    text[]
  confidence        enum(low|medium|high)
  status            enum(submitted|under_review|approved|rejected)
  reviewed_by       → User nullable
  review_note       text nullable
  reviewed_at       timestamptz nullable
  market_price_point_id → MarketPricePoint nullable  -- set on approval
  created_at        timestamptz
  updated_at        timestamptz
}
```

**Field agent endpoints** (new, under `/api/v2/field`):
```
POST   /field/observations              -- submit an observation (field_agent role)
GET    /field/observations              -- list own submissions (field_agent)
GET    /field/observations/:id          -- detail (field_agent or admin)
PATCH  /field/observations/:id          -- correct before review (field_agent, status=submitted only)
DELETE /field/observations/:id          -- withdraw before review (field_agent)

-- Super admin review:
GET    /admin/field/observations?status=under_review&crop=&region=&from=&to=
PATCH  /admin/field/observations/:id/approve  -- body: { adjusted_price? }; creates MarketPricePoint
PATCH  /admin/field/observations/:id/reject   -- body: { reason }
POST   /admin/field/agents              -- grant field_agent capability to a user
DELETE /admin/field/agents/:user_id     -- revoke capability
GET    /admin/field/agents              -- list agents, submission counts, approval rates
```

**Offline / batch submission:** agents in low-connectivity areas may batch multiple
observations into one request — accept `POST /field/observations/batch` with an array
(max 50); process each independently, return a per-item result array. Validate
idempotency on `(agent_id, crop_id, region, observed_at, price_type)` to prevent
duplicate submissions from retries.

#### 7.3.2 Super admin data injection (historical & real-time)

Super admins can push market price data from any authoritative external source
(government statistics, commodity exchange feeds, import/export records, NGO surveys)
directly into the system. This is the primary way to backfill **historical data** (e.g.
the 2-year price history required for trend charts) and to ingest **real-time feeds**.

**Injection modes:**

1. **Single-point entry** — form / API body with one price point.
2. **Bulk CSV/JSON upload** — upload a file of up to 50,000 rows; processed as a
   background job; progress polled via a job status endpoint.
3. **External feed registration** — register a URL + schedule (cron); the system polls
   it periodically, maps the response to `MarketPricePoint` rows, and reports any errors.
   (v1: support JSON feeds; CSV over HTTP as a stretch goal.)
4. **Forecast injection** — inject pre-computed forecasts (confidence_low, predicted,
   confidence_high) from an external model; stored as `PriceForecast` with
   `model_version` and `source`.

**Data fields for a price-point injection** (single or per row in bulk):
- `crop_slug` or `crop_id` — identifies the crop (system resolves slug → id).
- `region` — district/area name; must match a known region or be `national`.
- `observed_at` — ISO 8601 datetime (historical or near-real-time).
- `price` — decimal string in GHS (system converts to pesewas internally).
- `currency` — default `GHS`; include for future multi-currency support.
- `price_type` — `farm_gate | wholesale | retail | auction | index` (required).
- `source` — free text describing the origin: `MoFA`, `GFEP`, `commodity_exchange`,
  `field_survey`, etc. Required; stored on `MarketPricePoint.source`.
- `source_url` — URL reference for the data point (optional; aids audit).
- `volume_kg` — traded volume if available (optional; enriches supply signal).
- `quality_grade` — if the source distinguishes grade (optional).
- `notes` — any annotation (optional).

**CSV template** (downloadable from the admin UI):
```
crop_slug,region,observed_at,price_ghc,price_type,source,source_url,volume_kg,quality_grade,notes
maize,ashanti,2023-01-05T09:00:00Z,90.00,wholesale,MoFA,,5000,A,
rice,northern,2023-01-05T09:00:00Z,280.00,retail,GFEP,https://...,,,
```

**De-duplication:** on `(crop_id, region, observed_at, price_type, source)`. Duplicate
rows are skipped (not errored); the bulk job reports a `skipped_count` in its summary.

**Bulk job entity (new table):**
```
DataIngestionJob {
  id              UUID PK
  type            enum(csv_upload|json_upload|external_feed_run|forecast_import)
  feed_id         → ExternalFeed nullable
  submitted_by    → User
  status          enum(pending|processing|completed|failed|partial)
  row_count       int nullable
  processed_count int
  skipped_count   int
  error_count     int
  errors          jsonb   -- array of { row, field, message }
  storage_ref     text    -- object-storage key of the uploaded file
  started_at      timestamptz nullable
  completed_at    timestamptz nullable
  created_at      timestamptz
}
```

**ExternalFeed entity (new table):**
```
ExternalFeed {
  id              UUID PK
  name            varchar
  url             text
  format          enum(json|csv)
  field_map       jsonb    -- maps source fields → our schema fields
  crop_id         → Crop nullable  -- if the feed covers one crop
  region          varchar nullable
  price_type      enum(...)
  source_label    varchar  -- stored as MarketPricePoint.source
  schedule_cron   varchar  -- e.g. "0 6 * * *"
  is_active       bool
  last_run_at     timestamptz nullable
  last_run_status varchar nullable
  created_by      → User
  created_at      timestamptz
}
```

**Admin data injection endpoints** (new, under `/api/v2/admin/market-data`):
```
-- Single-point and bulk injection:
POST   /admin/market-data/price-points          -- single price point
POST   /admin/market-data/price-points/bulk     -- multipart/form-data with file + metadata
GET    /admin/market-data/jobs                  -- list ingestion jobs (paginated)
GET    /admin/market-data/jobs/:id              -- job detail + error log
GET    /admin/market-data/jobs/:id/errors/csv   -- download error rows as CSV
GET    /admin/market-data/csv-template          -- download blank CSV template

-- Forecast injection:
POST   /admin/market-data/forecasts             -- single forecast point
POST   /admin/market-data/forecasts/bulk        -- file upload, same pattern

-- External feed management:
POST   /admin/market-data/feeds                 -- register a feed
GET    /admin/market-data/feeds                 -- list feeds
GET    /admin/market-data/feeds/:id
PATCH  /admin/market-data/feeds/:id
DELETE /admin/market-data/feeds/:id
POST   /admin/market-data/feeds/:id/run-now     -- trigger an immediate poll
GET    /admin/market-data/feeds/:id/runs        -- run history

-- Review / audit:
GET    /admin/market-data/price-points?crop=&region=&from=&to=&source=  -- browse injected data
DELETE /admin/market-data/price-points/:id      -- soft-delete a bad data point (with audit entry)
PATCH  /admin/market-data/price-points/:id      -- correct a value (creates new point, flags old as superseded)
```

**After any injection that adds `MarketPricePoint` rows**, trigger:
- Coin price recompute job for all coins backed by the affected crop.
- Forecast refresh job if the new data falls outside the existing forecast's confidence band.
- A `market.data_updated` internal event for watchlist alert evaluation.

De-duplicates and forecasts come from System 1's AI service or an internal model; store with
`model_version` and confidence bounds.

---

## 8. Money handling (non-negotiable rules)

1. **Integer minor units.** Store all amounts as integer pesewas (`bigint`); 1 GHS =
   100 pesewas. Never use floats for money. Format to decimals only at the edge.
2. **Double-entry ledger.** Every money movement writes balanced `LedgerEntry` rows
   that net to zero per `transaction_id`. Wallet balances are derived/reconciled from
   the ledger — the ledger is the source of truth.
3. **Atomicity.** Wrap multi-row money operations (buy, sell, purchase, settle, accept)
   in DB transactions with row locking to prevent double-spend / oversell.
4. **Idempotency.** Require an `Idempotency-Key` header on every money-moving POST and
   on payment webhooks; return the original result on retry.
5. **Escrow.** Farm deals and pending payments move funds into an `escrow` account, not
   directly between users; release on confirmation, refund on cancel.
6. **Webhooks.** Verify provider signatures; treat webhooks as the authority for
   deposit/withdrawal completion; make them idempotent.
7. **Auditability.** Every admin action and money movement writes an `AuditLog` row.

---

## 9. Background jobs & events

- **Coin price recompute** — scheduled + triggered on new market data (including after
  field observation approval and any data injection batch completing).
- **Forecast refresh** — pull/generate `PriceForecast` per crop/region; also triggered
  when new price points fall outside an existing forecast's confidence band.
- **Investment maturity & settlement reminders** — flag matured positions; notify admin.
- **Listing/offer expiry** sweeper.
- **Field observation review reminder** — daily digest to super_admin of
  `under_review` observations older than 48 hours.
- **External feed poller** — cron-based job per active `ExternalFeed`; polls URL,
  maps fields, inserts `MarketPricePoint` rows, writes `DataIngestionJob` run record.
- **Bulk ingestion worker** — processes queued `DataIngestionJob` rows (CSV/JSON
  uploads) in the background; streams rows in chunks; writes progress to the job record.
- **Notification fan-out** for events below (reuse System 1's notification service):
  - `offer.received`, `offer.countered`, `offer.accepted`, `offer.rejected`
  - `deal.payment_required`, `deal.completed`
  - `investment.purchased`, `investment.matured`, `investment.settled`
  - `coin.price_alert` (watchlist threshold), `coin.delisted`
  - `wallet.deposit_completed`, `wallet.withdrawal_completed`
  - `listing.match` (saved search), `market.new_insight`
  - `field.observation_approved`, `field.observation_rejected` — notifies the submitting agent
  - `market.data_updated` — internal event after any injection or observation approval;
    triggers watchlist alert evaluation and coin recompute
  - `ingestion_job.completed`, `ingestion_job.failed` — notifies the admin who submitted the job
  - `external_feed.error` — notifies admin when a feed poll fails

---

## 10. Non-functional requirements

- Input validation on every endpoint (DTO/schema); reject unknown fields on money routes.
- RBAC enforced server-side; never trust client role claims for authorization.
- Rate limiting on auth, offers, and trade endpoints.
- Pagination + filtering + sorting on all list endpoints.
- Consistent error format; meaningful HTTP codes; no leaking internal errors.
- Structured logging with request/correlation IDs; metrics for trade volume, GMV, AUM.
- Tests: unit tests for pricing/settlement/ledger math; integration tests for the
  offer state machine, purchase→settle flow, and buy/sell with concurrent access.
- Seed script: crops, sample price history (2y maize/rice), a couple of coins, a couple
  of investment plans, demo users per role.
- OpenAPI/Swagger generated from the code.

---

## 11. Build order (deliverables)

1. Project scaffold, config, DB connection, migrations, auth/RBAC, Wallet + LedgerEntry,
   AuditLog. Seed users per role. Include `field_agent` capability flag.
2. Crops + MarketPricePoint (with `price_type`, `source_url`, `is_superseded` fields) +
   trends/forecast/insight read endpoints + seed 2y data.
3. **Field data collection:** `FieldObservation` entity + field agent capability grant/revoke +
   `POST /field/observations` (single + batch) + admin review endpoints
   (`/admin/field/observations` approve/reject). Auto-approve high-confidence submissions;
   queue medium/low for review. On approval, write `MarketPricePoint` and trigger coin
   recompute.
4. **Admin data injection:** `DataIngestionJob` + `ExternalFeed` entities + single-point,
   CSV/JSON bulk upload, forecast injection endpoints + CSV template download + background
   job worker + external feed scheduler (cron-based) + error CSV export. Trigger coin
   recompute and forecast refresh after any new price-point batch.
5. FarmRef sync from System 1; Listings + Offers + Deal state machines + escrow.
6. InvestmentPlan + Purchase + Settlement with full ledger wiring.
7. Coin model + pricing engine + price history + buy/sell + holdings/P&L.
8. Wallet deposits/withdrawals + payment provider + webhooks.
9. Watchlists/saved searches + notification events (include `market.data_updated` for
   watchlist evaluation after any injection or field-observation approval).
10. Admin endpoints + metrics + audit log views (include field agent stats and injection
    job history in the admin console).
11. OpenAPI, tests, seed, README (incl. the compliance note).

**New test coverage to add:**
- Field observation state machine (submit → approve/reject → MarketPricePoint created).
- Batch submission de-duplication and partial-success response.
- Bulk CSV job: valid rows accepted, invalid rows surfaced in error log, skipped duplicates
  counted correctly.
- External feed poll: field mapping applied, de-dupe works, error stored on job.
- Price correction: old point flagged `is_superseded`, new point created, coin recompute
  triggered.
- Concurrent bulk uploads for the same crop/region don't produce duplicate price points.
-e 
Output the code module by module. After each module, summarize the entities, endpoints,
and any **[DECISION]** points you resolved differently from this brief, and why.
