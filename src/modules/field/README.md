# Field Module

Manages field agent credentialing and price observations submitted from the ground. Approved observations flow directly into the market price series and trigger coin price recomputation.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `FieldObservation` | `field_observations` | A price observation recorded by a field agent |
| `FieldAgentCapability` | `field_agent_capabilities` | Grant/revoke record for the field agent role |

### Observation statuses

```
SUBMITTED → UNDER_REVIEW → APPROVED
                         → REJECTED
```

| Status | Meaning |
|--------|---------|
| `SUBMITTED` | Observation recorded, pending review |
| `UNDER_REVIEW` | Under admin review |
| `APPROVED` | Accepted and published as a market price point |
| `REJECTED` | Rejected with a reason note |

### Confidence levels

| Level | Effect |
|-------|--------|
| `HIGH` | Auto-approved immediately on submission |
| `MEDIUM` / `LOW` | Requires manual admin review |

### Price types

`FARM_GATE` · `WHOLESALE` · `RETAIL` · `AUCTION`

### Quality grades

`A` · `B` · `C` · `UNGRADED`

---

## Field agent credentialing

Access to submit observations is controlled by `FieldAgentCapability`. A `super_admin` grants the capability via `grantFieldAgentCapability`, which:
1. Creates a `FieldAgentCapability` row (idempotent — returns the existing record if already granted)
2. Sets `farmer.isFieldAgent = true`

Revoking sets `revokedAt` on the capability row and flips the flag back to `false`. The `FieldAgentGuard` checks `isFieldAgent` on the JWT principal at request time.

---

## Observation lifecycle

```
Field agent submits observation
        │
        ├── confidence === HIGH → autoApprove()
        │         │
        │         ▼
        │   createPricePoint() in market module
        │   obs.status → APPROVED
        │   coin-price-recompute job enqueued
        │
        └── confidence !== HIGH → status stays SUBMITTED
                  │
                  ▼
          super_admin calls approveFieldObservation(id, adjustedPrice?)
                  │
                  ▼
          autoApprove() → same flow as HIGH confidence
          (adjustedPrice overrides observedPrice before publishing)
```

Observations can only be edited or deleted while they are in `SUBMITTED` status.

---

## Batch submission

`submitFieldObservationBatch` accepts up to 50 observations in one call. Each item is checked for idempotency against `(agentId, cropId, region, observedAt, priceType)` — duplicates are counted as `skipped` rather than errors. Results include per-item `success`, `observationId`, `skipped`, and `error` fields plus aggregate counts.

---

## GraphQL API

### Field agent operations (`FieldAgentGuard`)

| Operation | Type | Description |
|-----------|------|-------------|
| `submitFieldObservation(input)` | Mutation | Submit a single observation |
| `submitFieldObservationBatch(inputs)` | Mutation | Submit up to 50 observations |
| `updateFieldObservation(id, input)` | Mutation | Edit a SUBMITTED observation |
| `deleteFieldObservation(id)` | Mutation | Delete a SUBMITTED observation |
| `myFieldObservations` | Query | Caller's own observations |

### Public (JWT only)

| Operation | Type | Description |
|-----------|------|-------------|
| `fieldObservation(id)` | Query | Single observation by ID |

### Admin operations (`super_admin`)

| Operation | Type | Description |
|-----------|------|-------------|
| `adminFieldObservations(status?, cropId?, region?, from?, to?)` | Query | Browse all observations |
| `approveFieldObservation(id, adjustedPrice?)` | Mutation | Approve and publish |
| `rejectFieldObservation(id, reason)` | Mutation | Reject with a reason |
| `grantFieldAgentCapability(userId)` | Mutation | Grant field agent role |
| `revokeFieldAgentCapability(userId)` | Mutation | Revoke field agent role |
| `fieldAgents` | Query | List all active field agents |
