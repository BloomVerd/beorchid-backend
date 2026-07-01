# Investment Module

Enables investors to participate in farm investment plans. Admins create fixed-unit plans tied to a crop and farm acreage; investors purchase units; at maturity the admin settles the plan and all investors are paid out in a single atomic transaction.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `InvestmentPlan` | `investment_plans` | A structured investment product with unit pricing and return projections |
| `InvestmentPurchase` | `investment_purchases` | An investor's stake in a plan (units × unitCost) |
| `InvestmentSettlement` | `investment_settlements` | Audit record created when a plan is settled |

### Plan statuses

```
DRAFT → OPEN → CLOSED → MATURED → SETTLED
```

| Status | Meaning |
|--------|---------|
| `DRAFT` | Created but not yet visible to investors |
| `OPEN` | Accepting investor purchases |
| `CLOSED` | No longer accepting purchases |
| `MATURED` | Past the maturity date, awaiting settlement |
| `SETTLED` | Fully paid out to investors |

### Purchase statuses

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Investment is live |
| `MATURED` | Past maturity, pending payout |
| `SETTLED` | Payout credited to investor wallet |
| `CANCELLED` | Investment cancelled before maturity |

---

## Money amounts

All monetary values (`unitCost`, `expectedProfitMin`, `expectedProfitMax`, `principal`, `payoutAmount`, `actualProfitPerUnit`) are stored and returned as **pesewas** (GHS × 100). Divide by 100 to display in GHS.

---

## Investment lifecycle

```
super_admin creates InvestmentPlan (DRAFT)
        │
        ▼
openInvestmentPlan → status: OPEN
        │
        ▼
Investor calls purchaseInvestment(planId, units)
  → investor wallet debited (units × unitCost) → INVESTMENT_POOL
  → plan.unitsRemaining decremented
  → InvestmentPurchase created (ACTIVE)
  → investor notified
        │
   (optional)
        ▼
closeInvestmentPlan → status: CLOSED
        │
        ▼
super_admin calls settleInvestmentPlan(planId, actualProfitPerUnit)
  → For each ACTIVE purchase in the plan (single transaction):
      payout = principal + units × actualProfitPerUnit
      investor wallet credited (payout) → USER_CASH
      purchase → SETTLED
      investor notified
  → plan → SETTLED
  → InvestmentSettlement audit record created
```

### Payout formula

```
payout = principal + (units × actualProfitPerUnit)
       = (units × unitCost) + (units × actualProfitPerUnit)
```

Payout is clamped to a minimum of 0 (`Math.max(0, payout)`) to protect against negative returns eroding principal beyond zero.

---

## Risk filtering

The `lowRiskOnly` filter on `listPlans` performs a SQL text search on the free-text `riskNotes` field, excluding any plan whose notes contain the words "high", "moderate", or "medium". This is a best-effort filter — plans with no `riskNotes` pass through regardless.

---

## GraphQL API

### Queries (JWT required)

| Query | Roles | Description |
|-------|-------|-------------|
| `investmentPlans(status?, cropId?, maxMaturityDays?, lowRiskOnly?)` | Any authenticated | Browse available plans |
| `investmentPlan(id)` | Any authenticated | Single plan by ID |
| `myInvestments` | Any authenticated | Caller's own purchases |

### Mutations

| Mutation | Roles | Description |
|----------|-------|-------------|
| `createInvestmentPlan(input)` | `super_admin` | Create a new plan in DRAFT status |
| `openInvestmentPlan(id)` | `super_admin` | Move plan from DRAFT → OPEN |
| `closeInvestmentPlan(id)` | `super_admin` | Close a plan to new purchases |
| `purchaseInvestment(planId, units)` | Any authenticated | Buy units in an open plan |
| `settleInvestmentPlan(planId, actualProfitPerUnit, notes?)` | `super_admin` | Pay out all active investors |

---

## Wallet integration

| Event | Wallet operation |
|-------|-----------------|
| `purchaseInvestment` | `debit(investorWallet, principal, INVESTMENT_POOL)` |
| `settleInvestmentPlan` | `credit(investorWallet, payout, USER_CASH)` per purchase |

Both operations use pessimistic write locks on the plan row to prevent overselling units.
