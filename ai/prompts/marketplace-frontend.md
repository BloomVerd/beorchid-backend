# BeOrchid AgriMarket & Investment Platform — Frontend Integration Prompt

## Overview

You are integrating a React/Next.js frontend with the **BeOrchid System 2** backend: an AgriMarket and agri-fintech platform built on NestJS + GraphQL (Apollo Server, code-first). All data queries and mutations use GraphQL except two REST-only flows: Paystack payment webhooks and bulk CSV uploads.

**GraphQL endpoint:** `POST /graphql`  
**Authentication:** Bearer JWT in `Authorization` header. Obtain the token via the existing login mutation, then include it in every request.

---

## 0. Authentication

All System 2 operations require a valid JWT. The token is issued at login and carries `id`, `email`, `roles`, and `isFieldAgent` in the payload.

```graphql
mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    accessToken
    refreshToken
    farmer {
      id email firstName lastName roles isFieldAgent
    }
  }
}
```

Store `accessToken` in memory (not localStorage for security). Attach to every GQL request:

```typescript
headers: { Authorization: `Bearer ${accessToken}` }
```

**Role values:** `farmer` | `company` | `field_agent` | `super_admin`

---

## 1. Money Formatting

All monetary amounts are stored as **bigint pesewas** (1 GHS = 100 pesewas). Always divide by 100 before display and multiply by 100 before sending.

```typescript
const toGHS = (pesewas: number) => (pesewas / 100).toFixed(2);
const toPesewas = (ghs: number) => Math.round(ghs * 100);
```

---

## 2. Wallet

### Queries

```graphql
query MyWallet {
  myWallet {
    id availableBalance lockedBalance currency ownerType
  }
}

query MyLedger($from: DateTime, $to: DateTime) {
  myLedger(from: $from, to: $to) {
    id direction amount account transactionId createdAt
  }
}
```

### Mutations

```graphql
mutation InitiateDeposit($amount: Int!, $idempotencyKey: String!) {
  initiateDeposit(amount: $amount, idempotencyKey: $idempotencyKey) {
    checkoutUrl
    intent { id status amount providerRef }
  }
}
```

**Deposit flow:**
1. Generate a client-side `idempotencyKey` (e.g. `uuid()`). Store it so you can retry safely without double-charging.
2. Call `initiateDeposit` — receives `checkoutUrl` (Paystack hosted page).
3. Redirect user to `checkoutUrl`.
4. On return redirect, poll `myWallet` until `availableBalance` increases, or show a "payment processing" state.

The Paystack webhook at `POST /api/v2/webhooks/payments/paystack` is handled server-side automatically — no frontend action required.

---

## 3. Marketplace — Listings

### Queries

```graphql
query Listings($crop: String, $region: String, $status: ListingStatus) {
  listings(crop: $crop, region: $region, status: $status) {
    id crop region acreage askingPrice currency status
    sellerId farmId expiresAt createdAt
  }
}

query ListingDetail($id: ID!) {
  listing(id: $id) {
    id crop region acreage askingPrice currency description status
    sellerId farmId expiresAt createdAt updatedAt
  }
}

query ListingOffers($listingId: ID!) {
  listingOffers(listingId: $listingId) {
    id buyerId amount status message parentOfferId expiresAt createdAt
  }
}
```

**`ListingStatus` enum:** `draft` | `open` | `under_offer` | `accepted` | `sold` | `withdrawn` | `expired`

### Mutations

```graphql
mutation CreateListing($input: CreateListingInput!) {
  createListing(input: $input) {
    id status expiresAt
  }
}
# input fields: farmId, crop, region, acreage, askingPrice (pesewas), currency, description?

mutation WithdrawListing($id: ID!) {
  withdrawListing(id: $id) { id status }
}
```

---

## 4. Marketplace — Offers

**`OfferStatus` enum:** `pending` | `countered` | `accepted` | `rejected` | `withdrawn` | `expired`

```graphql
mutation MakeOffer($listingId: ID!, $amount: Int!, $message: String) {
  makeOffer(listingId: $listingId, amount: $amount, message: $message) {
    id status amount expiresAt
  }
}

mutation CounterOffer($offerId: ID!, $amount: Int!, $message: String) {
  counterOffer(offerId: $offerId, amount: $amount, message: $message) {
    id status amount parentOfferId
  }
}

mutation AcceptOffer($offerId: ID!) {
  acceptOffer(offerId: $offerId) {
    id status amount sellerId buyerId escrowLedgerRef
  }
}

mutation RejectOffer($offerId: ID!) {
  rejectOffer(offerId: $offerId) { id status }
}

mutation WithdrawOffer($offerId: ID!) {
  withdrawOffer(offerId: $offerId) { id status }
}

query MyOffers {
  myOffers { id listingId amount status message expiresAt createdAt }
}
```

---

## 5. Marketplace — Deals

**`DealStatus` enum:** `pending_payment` | `in_escrow` | `completed` | `cancelled` | `disputed`

```graphql
query MyDeals {
  myDeals {
    id listingId acceptedOfferId sellerId buyerId amount status
    escrowLedgerRef createdAt updatedAt
  }
}

query DealDetail($id: ID!) {
  deal(id: $id) {
    id listingId sellerId buyerId amount status escrowLedgerRef createdAt
  }
}

mutation ConfirmDealPayment($dealId: ID!) {
  confirmDealPayment(dealId: $dealId) { id status }
}
```

**Offer → Deal state machine (UI flow):**
1. Seller sees `listingOffers` — calls `acceptOffer` → creates Deal `in_escrow`, buyer's wallet debited.
2. Buyer calls `confirmDealPayment` → Deal becomes `completed`, seller's wallet credited.
3. Both parties receive in-app notifications (poll `myNotifications` or use subscriptions if wired up).

---

## 6. Investments

**`PlanStatus` enum:** `draft` | `open` | `closed` | `matured` | `settled`  
**`PurchaseStatus` enum:** `active` | `matured` | `settled` | `cancelled`

```graphql
query InvestmentPlans($status: PlanStatus, $cropId: ID) {
  investmentPlans(status: $status, cropId: $cropId) {
    id title cropId acreage unitCost expectedProfitMin expectedProfitMax
    maturityDays totalUnits unitsRemaining riskNotes status createdAt
  }
}

query InvestmentPlanDetail($id: ID!) {
  investmentPlan(id: $id) {
    id title unitCost expectedProfitMin expectedProfitMax
    maturityDays totalUnits unitsRemaining status riskNotes
  }
}

query MyInvestments {
  myInvestments {
    id planId units principal status purchasedAt maturesAt
    payoutAmount settlementLedgerRef
  }
}

mutation PurchaseInvestment($planId: ID!, $units: Float!) {
  purchaseInvestment(planId: $planId, units: $units) {
    id units principal status maturesAt
  }
}
```

**Display notes:**
- `unitCost`, `principal`, `payoutAmount`, `expectedProfitMin/Max` are all in pesewas — divide by 100.
- Show `maturesAt` as a countdown: `maturesAt - now`.
- `payoutAmount` may be less than `principal` — do NOT imply guaranteed returns in the UI.

---

## 7. Coins

**`CoinStatus` enum:** `draft` | `active` | `paused` | `delisted`  
**`CoinSide` enum:** `buy` | `sell`

```graphql
query Coins {
  coins {
    id name symbol cropId basePrice currentPrice
    circulatingSupply status createdAt
  }
}

query CoinDetail($id: ID!) {
  coin(id: $id) {
    id name symbol cropId basePrice currentPrice
    pricingWeights circulatingSupply status
  }
}

query CoinPrices($coinId: ID!, $from: DateTime, $to: DateTime) {
  coinPrices(coinId: $coinId, from: $from, to: $to) {
    id price computedAt inputs
  }
}

query MyCoins {
  myCoins {
    holding { id coinId units avgCost }
    coin { id name symbol currentPrice }
    currentValue
    unrealizedPnl
  }
}

mutation BuyCoin($coinId: ID!, $units: Float!, $idempotencyKey: String!) {
  buyCoin(coinId: $coinId, units: $units, idempotencyKey: $idempotencyKey) {
    id side units unitPrice grossAmount executedAt
  }
}

mutation SellCoin($coinId: ID!, $units: Float!, $idempotencyKey: String!) {
  sellCoin(coinId: $coinId, units: $units, idempotencyKey: $idempotencyKey) {
    id side units unitPrice grossAmount executedAt
  }
}
```

**Display notes:**
- `currentPrice`, `basePrice`, `unitPrice`, `grossAmount`, `currentValue`, `unrealizedPnl` are pesewas.
- Generate a fresh `idempotencyKey` per transaction attempt. Retry with the same key to avoid double execution.
- `unrealizedPnl` can be negative — render in red with a `−` prefix.
- Use `coinPrices` to render a price chart; `inputs` jsonb contains the pricing factors for a tooltip.

---

## 8. Market Data

```graphql
query Crops {
  crops { id name slug unit }
}

query CropPrices($cropId: ID!, $region: String, $from: DateTime, $to: DateTime) {
  cropPrices(cropId: $cropId, region: $region, from: $from, to: $to) {
    id region price currency observedAt priceType source qualityGrade
  }
}

query CropForecast($cropId: ID!, $region: String!, $horizon: Int) {
  cropForecast(cropId: $cropId, region: $region, horizon: $horizon) {
    id predictedPrice confidenceLow confidenceHigh horizonDays generatedAt
  }
}

query MarketInsights($cropId: ID, $region: String) {
  marketInsights(cropId: $cropId, region: $region) {
    id type payload publishedAt
  }
}
```

**`PriceType` enum:** `farm_gate` | `wholesale` | `retail` | `auction` | `index`

**Regions:** `ashanti` | `northern` | `greater_accra` | `brong_ahafo` (and others)

---

## 9. Watchlist & Saved Searches

**`WatchlistEntityType` enum:** `crop` | `coin` | `listing` | `plan`

```graphql
query MyWatchlist {
  myWatchlist {
    id entityType entityId priceThreshold createdAt
  }
}

mutation AddToWatchlist(
  $entityType: WatchlistEntityType!
  $entityId: ID!
  $priceThreshold: Int
) {
  addToWatchlist(entityType: $entityType, entityId: $entityId, priceThreshold: $priceThreshold) {
    id entityType entityId priceThreshold
  }
}

mutation RemoveFromWatchlist($id: ID!) {
  removeFromWatchlist(id: $id)
}

query MySavedSearches {
  mySavedSearches { id name filters createdAt }
}

mutation CreateSavedSearch($name: String!, $filters: Object!) {
  createSavedSearch(name: $name, filters: $filters) { id name filters }
}

mutation DeleteSavedSearch($id: ID!) {
  deleteSavedSearch(id: $id)
}
```

---

## 10. Field Observations (Field Agents Only)

```graphql
mutation SubmitFieldObservation($input: SubmitObservationInput!) {
  submitFieldObservation(input: $input) {
    id status confidence cropId region observedAt pricePerUnit
  }
}
# Required input fields: cropId, region, observedAt (ISO 8601), pricePerUnit (pesewas),
# priceType, qualityGrade, confidence, volumeKg?, conditionTags?, notes?

mutation SubmitFieldObservationBatch($items: [SubmitObservationInput!]!) {
  submitFieldObservationBatch(items: $items) {
    id status confidence cropId region
  }
}
# Max 50 items per batch. Duplicates on (agentId, cropId, region, observedAt, priceType) are silently deduplicated.

query MyFieldObservations {
  myFieldObservations {
    id status cropId region observedAt pricePerUnit qualityGrade confidence
    rejectionReason createdAt
  }
}
```

**`ObservationStatus` enum:** `pending` | `under_review` | `approved` | `rejected`  
**`ObservationConfidence` enum:** `high` | `medium` | `low`  
High-confidence observations are auto-approved and immediately update market price data.

---

## 11. Admin Queries (super_admin role required)

```graphql
query AdminUsers {
  adminUsers { id email firstName lastName roles isFieldAgent createdAt }
}

query AdminMetrics {
  adminMetrics {
    gmv aum coinVolume activeInvestments totalListings totalDeals totalUsers
  }
}

query AdminDeals {
  adminDeals { id status amount sellerId buyerId createdAt }
}

query AdminOffers {
  adminOffers { id status amount listingId buyerId createdAt }
}

query AuditLog($entity: String, $from: DateTime, $to: DateTime) {
  auditLog(entity: $entity, from: $from, to: $to) {
    id actorId action entity entityId diff createdAt
  }
}

mutation UpdateUserRoles($userId: ID!, $roles: [String!]!) {
  updateUserRoles(userId: $userId, roles: $roles) { id roles }
}

mutation SuspendUser($userId: ID!) {
  suspendUser(userId: $userId) { id }
}

mutation GrantFieldAgent($userId: ID!) {
  grantFieldAgent(userId: $userId) { id isFieldAgent }
}

mutation RevokeFieldAgent($userId: ID!) {
  revokeFieldAgent(userId: $userId) { id isFieldAgent }
}
```

---

## 12. REST Endpoints (non-GraphQL)

### Bulk CSV Upload (super_admin)

```
GET  /api/v2/admin/market-data/csv-template
     → downloads a blank CSV template for price points

POST /api/v2/admin/market-data/price-points/bulk
     Content-Type: multipart/form-data
     Body: file (CSV or JSON)
     → returns { jobId: string }

GET  /api/v2/admin/market-data/jobs/:id/errors/csv
     → downloads rows that failed validation for the given job

# After upload, poll ingestionJob(id) via GraphQL until status = 'completed':
query IngestionJob($id: ID!) {
  ingestionJob(id: $id) { id status rowsProcessed rowsErrored completedAt }
}
```

---

## 13. Error Handling Pattern

All GraphQL errors follow the standard `errors[].message` format. The backend uses NestJS exception filters:

- `BadRequestException` → `400`-class GQL error — show inline form validation
- `NotFoundException` → resource missing — show empty state
- `ForbiddenException` → role/ownership mismatch — show "Not authorized"
- `BadRequestException("Insufficient balance")` → wallet top-up prompt

```typescript
const result = await client.mutate({ mutation: MAKE_OFFER, variables });
if (result.errors) {
  const msg = result.errors[0].message;
  if (msg.includes('Insufficient balance')) showDepositModal();
  else showToast(msg);
}
```

---

## 14. Notifications

Use the existing `myNotifications` query and `markNotificationRead` mutation (already in System 1). New notification types added for System 2:

| Type | Trigger |
|---|---|
| `OFFER_RECEIVED` | Seller gets an offer |
| `OFFER_ACCEPTED` | Buyer's offer accepted |
| `OFFER_COUNTERED` | Counter-offer received |
| `DEAL_COMPLETED` | Deal payment confirmed |
| `INVESTMENT_PURCHASED` | Purchase confirmed |
| `INVESTMENT_SETTLED` | Plan settled, payout credited |
| `COIN_PRICE_ALERT` | Coin crosses watchlist threshold |
| `WALLET_DEPOSIT_COMPLETED` | Paystack deposit confirmed |
| `FIELD_OBSERVATION_APPROVED` | Field agent observation approved |
| `MARKET_DATA_UPDATED` | New price data available |

---

## 15. Key UX Rules

1. **Money**: always show in GHS with 2 decimal places. Never show raw pesewas to users.
2. **Idempotency keys**: generate once per user action, persist across retries, discard after success.
3. **Offer state transitions**: only show actions valid for current status. An `accepted` offer cannot be withdrawn.
4. **Investment returns**: do NOT display a guaranteed return. Show `expectedProfitMin – expectedProfitMax` as a range with a disclaimer.
5. **Coin P&L**: `unrealizedPnl` is informational only — not realised until sold. Display with appropriate risk disclosure.
6. **Field agent badge**: check `farmer.isFieldAgent` from the JWT payload to conditionally render the observation submission UI.
7. **Admin gate**: check `farmer.roles.includes('super_admin')` to show/hide admin dashboard routes.
