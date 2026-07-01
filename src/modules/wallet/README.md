# Wallet Module

GHS wallet management with double-entry ledger accounting and Paystack deposit integration.

---

## Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `Wallet` | `wallets` | Single GHS wallet per user; tracks `availableBalance` and `lockedBalance` |
| `LedgerEntry` | `ledger_entries` | Immutable double-entry record of every balance change |
| `PaymentIntentV2` | `payment_intents_v2` | Tracks Paystack deposit lifecycle (PENDING → COMPLETED) |

### Balance model

```
availableBalance  — spendable funds
lockedBalance     — funds reserved for pending operations (e.g. escrow)
```

Every `debit`, `credit`, `lock`, or `unlock` call writes a matching `LedgerEntry` row, giving a complete auditable history. All mutating operations use a `pessimistic_write` lock on the `Wallet` row to prevent concurrent over-spend.

### LedgerAccount values

| Account | Used for |
|---------|----------|
| `USER_CASH` | Standard user balance (deposits, sell proceeds, escrow releases) |
| `ESCROW` | Funds held during active deals |
| `COIN_POOL` | Funds used to purchase coin units |

---

## Deposit flow

```
Client
  └─ mutation initiateDeposit(amountPesewas, idempotencyKey)
       └─ WalletService.initiateDeposit
            ├─ check idempotencyKey → return existing intent if found
            ├─ call Paystack /transaction/initialize
            ├─ create PaymentIntentV2 (PENDING)
            └─ return { checkoutUrl, intent }

Paystack webhook (charge.success)
  └─ POST /api/payment/webhook  (PaymentController)
       └─ WalletService.handleDepositWebhook(providerRef)
            ├─ find PaymentIntentV2 by providerRef
            ├─ skip if already COMPLETED (idempotent)
            └─ transaction:
                 ├─ credit(wallet, amount, USER_CASH)
                 └─ update intent → COMPLETED
```

> **Note:** The Paystack webhook is handled by `PaymentController` (`POST /api/payment/webhook`) rather than `WalletController`, because the same webhook endpoint dispatches to either `SubscriptionService` (subscription payments) or `WalletService` (direct deposits) based on whether a `PaymentTransaction` row exists for the reference.

---

## API

### GraphQL

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `myWallet` | Query | JWT | Returns the authenticated user's wallet (created lazily) |
| `myLedger(from?, to?, account?)` | Query | JWT | Returns ledger entries with optional filters |
| `initiateDeposit(input)` | Mutation | JWT | Starts a Paystack deposit; returns checkout URL |

### REST

| Endpoint | Description |
|----------|-------------|
| `POST /api/payment/webhook` | Paystack webhook handler (shared with PaymentModule) |

---

## Service API

`WalletService` is exported and used by other modules:

| Method | Used by |
|--------|---------|
| `getOrCreateWallet(ownerId)` | CoinModule, MarketplaceModule, PaymentModule |
| `debit(walletId, amount, account, txnId, em?)` | CoinModule (buy), MarketplaceModule (escrow) |
| `credit(walletId, amount, account, txnId, em?)` | CoinModule (sell), MarketplaceModule (escrow release) |
| `lock(walletId, amount, em?)` | Reserved for future escrow locking |
| `unlock(walletId, amount, em?)` | Reserved for future escrow unlocking |
| `handleDepositWebhook(providerRef)` | PaymentController |

All mutating methods accept an optional `em` (TypeORM `EntityManager`) to participate in a caller-managed transaction.

---

## Configuration

| Env var | Description |
|---------|-------------|
| `PAYSTACK_SECRET_KEY` | Paystack secret key for API calls and webhook HMAC verification |
