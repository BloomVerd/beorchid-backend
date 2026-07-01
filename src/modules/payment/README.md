# Payment Module

Paystack-powered subscription lifecycle management with proration, multi-channel activation notifications, and webhook handling.

---

## Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `SubscriptionPlan` | `subscription_plans` | Plan catalogue (FREE, POPULAR, PREMIUM) |
| `FarmerSubscription` | `farmer_subscriptions` | Active/expired subscription records per farmer |
| `PaymentTransaction` | `payment_transactions` | Pending/success/failed Paystack payment records |

---

## Plan tiers

| Plan | Price (GHS) | Duration | Predictions/wk | Max farms | Health interval |
|------|-------------|----------|----------------|-----------|-----------------|
| FREE | 0 | — | 3 | 2 | 1 hour |
| POPULAR | 2,000 | 365 days | 15 | 10 | 30 min |
| PREMIUM | 5,000 | 365 days | 50 | 50 | 15 min |

Prices are stored in pesewas (÷ 100 = GHS). `SubscriptionPlanService.setupPlans()` upserts all three tiers on application bootstrap, so plan definitions always stay in sync with the code constants.

---

## Subscription lifecycle

```
1. Registration
   └─ SubscriptionService.assignFreePlan(farmerId)
        ├─ Creates ACTIVE FREE subscription
        └─ Syncs FarmerSettings to free-tier limits

2. Upgrade / switch
   └─ mutation initiateSubscriptionPayment(planId, callbackUrl?)
        └─ SubscriptionService.initiatePayment(farmerId, email, planId)
             ├─ Calculate proration credit from remaining paid period
             ├─ If credit ≥ new plan cost → activateImmediately() (no charge)
             └─ Else → Paystack /transaction/initialize
                  ├─ Creates PaymentTransaction (PENDING)
                  └─ Returns { authorizationUrl, reference }

3. Activation (webhook)
   └─ POST /api/payment/webhook  (charge.success)
        └─ PaymentController.handleWebhook
             ├─ Verify x-paystack-signature (HMAC-SHA512)
             ├─ Look up PaymentTransaction by reference
             └─ SubscriptionService.activateSubscription(reference)
                  ├─ Verify transaction with Paystack
                  ├─ Expire previous ACTIVE subscription
                  ├─ Create new ACTIVE subscription (period = now + durationDays)
                  ├─ Mark PaymentTransaction SUCCESS
                  ├─ Sync FarmerSettings to new plan limits
                  └─ Dispatch activation notifications (in-app / email / SMS)
```

---

## Webhook dispatch logic

`POST /api/payment/webhook` handles **both** subscription payments and direct wallet deposits:

```
charge.success event
  └─ Does a PaymentTransaction row exist for this reference?
       ├─ YES → SubscriptionService.activateSubscription(reference)
       └─ NO  → WalletService.handleDepositWebhook(reference)
```

> NestJS must be configured with `rawBody: true` in `NestFactory.create` so the raw `Buffer` is available for HMAC signature verification.

---

## Proration

When a farmer upgrades or switches plans mid-period:

```
credit = floor((remainingMs / totalPeriodMs) × currentPlan.priceAmount)
chargeAmount = max(0, newPlan.priceAmount − credit)
```

If `chargeAmount === 0` (credit covers the full new plan cost), the plan is switched immediately without going through Paystack.

---

## Settings sync

On every plan activation, `FarmerSettings` is updated to reflect the new plan's limits:

| Setting | Source |
|---------|--------|
| `predictionWeeklyLimit` | `plan.predictionWeeklyLimit` |
| `farmDataLookbackSeconds` | `plan.farmDataLookbackSeconds` |
| `farmDataCacheTtlSeconds` | `plan.farmDataCacheTtlSeconds` |
| `healthReportIntervalSeconds` | `plan.healthReportIntervalSeconds` |
| `notifyEmail` | `true` for POPULAR/PREMIUM, `false` for FREE |
| `notifySms` | `true` for POPULAR/PREMIUM, `false` for FREE |

---

## API

### GraphQL

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `listSubscriptionPlans` | Query | None | Returns all active plan tiers |
| `getMySubscription` | Query | JWT | Returns the caller's active subscription; auto-assigns FREE for legacy accounts |
| `initiateSubscriptionPayment(input)` | Mutation | JWT | Starts a Paystack payment; returns checkout URL and reference |

### REST

| Endpoint | Description |
|----------|-------------|
| `POST /api/payment/webhook` | Paystack `charge.success` webhook handler |

---

## Configuration

| Env var | Description |
|---------|-------------|
| `PAYSTACK_SECRET_KEY` | Used for API calls (`initializeTransaction`, `verifyTransaction`) and webhook HMAC-SHA512 signature verification |
| `JWT_SECRET` | Used for the `JwtModule` within this module (webhook token verification) |

---

## Exports

| Export | Used by |
|--------|---------|
| `SubscriptionPlanService` | FarmerModule (assign free plan on registration) |
| `SubscriptionService` | FarmerModule, admin tooling |
| `PaymentService` | WalletModule (shares Paystack client) |
