# Marketplace Module

Handles farm listing discovery, offer negotiation, deal creation, and escrow-based payment settlement between farmers (sellers) and investors (buyers).

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `Listing` | `listings` | A farm plot put up for sale by a farmer |
| `Offer` | `offers` | A bid or counter-bid on a listing |
| `Deal` | `deals` | A confirmed agreement created when an offer is accepted |

### Listing statuses

`DRAFT` → `OPEN` → `UNDER_OFFER` → `ACCEPTED` → `SOLD` / `WITHDRAWN` / `EXPIRED`

### Offer statuses

`PENDING` → `COUNTERED` / `ACCEPTED` / `REJECTED` / `WITHDRAWN` / `EXPIRED`

### Deal statuses

`PENDING_PAYMENT` → `IN_ESCROW` → `COMPLETED` / `CANCELLED` / `DISPUTED`

---

## Offer Flow

```
Farmer creates Listing (OPEN)
        │
        ▼
Investor calls makeOffer
  → Listing moves to UNDER_OFFER
  → Offer created (PENDING, createdById = investor)
  → Farmer notified via SSE
        │
        ├── Farmer rejects → Offer REJECTED, investor notified
        │
        ├── Farmer counters → Original offer COUNTERED
        │     → New offer created (PENDING, createdById = farmer)
        │     → Investor notified via SSE
        │           │
        │           ├── Investor rejects → REJECTED, farmer notified
        │           ├── Investor counters → same pattern continues
        │           └── Investor accepts ──┐
        │                                  │
        └── Farmer accepts ────────────────┤
                                           ▼
                                   Buyer wallet debited (ESCROW)
                                   Deal created (IN_ESCROW)
                                   Other pending offers auto-rejected
                                   Both parties notified via SSE
                                           │
                                           ▼
                              Farmer fulfils the deal
                              Investor calls confirmDealPayment
                                           │
                                           ▼
                              Seller wallet credited (USER_CASH)
                              Deal → COMPLETED
                              Farmer notified via SSE
```

### Authorization rules

- Only `farmer` / `super_admin` roles can create or withdraw listings.
- Only `individual` / `company` / `super_admin` roles can make initial offers.
- `counterOffer`, `acceptOffer`, and `rejectOffer` are open to all authenticated roles (both sides negotiate).
- **A party cannot act on an offer they created.** Every offer row stores `createdById` — all three action methods check this and throw `403` if `createdById === actorId`.
- A farmer cannot make an offer on their own listing.

---

## Escrow Model

When an offer is accepted, the buyer's funds are locked:

```
acceptOffer
  → debit(buyerWallet, amount, ESCROW)   // buyer's availableBalance decreases
  → Deal created with status IN_ESCROW
```

The seller receives no wallet change at this point. They can see the pending amount by querying their `myDeals` (status `IN_ESCROW`).

**Insufficient buyer balance.** If the escrow debit fails because the buyer can't cover the offer amount, the error shown depends on who called `acceptOffer`:

- **Buyer accepting** (e.g. accepting a seller's counter-offer): the wallet service's `Insufficient balance` error is rethrown as-is — it's their own balance, so there's no ambiguity.
- **Seller accepting**: the raw balance error is *not* shown to them. Surfacing it would wrongly suggest the seller is being charged, and would let them repeatedly probe the buyer's balance by trial and error. Instead:
  - The buyer receives a `DEAL_PAYMENT_REQUIRED` notification telling them the seller tried to accept their offer but their wallet needs topping up.
  - The seller receives a generic "try again later" error with no balance information.

When the buyer confirms delivery:

```
confirmDealPayment
  → credit(sellerWallet, amount, USER_CASH)  // seller's availableBalance increases
  → Deal → COMPLETED
```

The buyer's escrow debit is balanced by the seller's cash credit — no intermediate seller-side escrow entry is needed.

---

## Notifications

All offer events trigger real-time SSE notifications (`pushToStream: true`) via the `NotificationsProducer`. Notifications are also persisted to the database regardless of whether the recipient is online.

| Event | Recipient | Type |
|-------|-----------|------|
| New offer received | Farmer (seller) | `OFFER_RECEIVED` |
| Counter offer received | Other party | `OFFER_COUNTERED` |
| Offer accepted | Buyer | `OFFER_ACCEPTED` |
| Deal in escrow | Farmer (seller) | `DEAL_PAYMENT_REQUIRED` |
| Seller tried to accept, buyer balance insufficient | Investor (buyer) | `DEAL_PAYMENT_REQUIRED` |
| Offer rejected | Offer creator | `OFFER_REJECTED` |
| Deal completed | Farmer (seller) | `DEAL_COMPLETED` |

---

## GraphQL API

### Queries

| Query | Auth | Description |
|-------|------|-------------|
| `listings(crop, region, status, maxPrice, minHealthScore)` | Any | Browse all open listings |
| `listing(id)` | Any | Single listing by ID |
| `myListings(farmId?)` | Authenticated | Farmer's own listings |
| `listingOffers(listingId)` | Authenticated | All offers on a listing |
| `myOffers` | Authenticated | Investor's own offers |
| `myDeals` | Authenticated | All deals for the current user |

### Mutations

| Mutation | Roles | Description |
|----------|-------|-------------|
| `createListing(input)` | `farmer`, `super_admin` | Create a new listing |
| `withdrawListing(id)` | `farmer`, `super_admin` | Withdraw a listing |
| `makeOffer(listingId, amount, message?)` | `individual`, `company`, `super_admin` | Make an initial offer |
| `counterOffer(offerId, amount, message?)` | Any authenticated | Counter a pending offer |
| `acceptOffer(offerId)` | Any authenticated | Accept a pending offer (creates a Deal) |
| `rejectOffer(offerId)` | Any authenticated | Reject a pending offer |
| `withdrawOffer(offerId)` | Any authenticated | Withdraw your own pending offer |
| `confirmDealPayment(dealId)` | Buyer | Confirm delivery and release escrow |

---

## Offer Chain & `createdById`

Counter-offers reuse `buyerId` (always the original investor) to maintain thread identity. The `createdById` column records who actually made each individual offer in the chain, enabling:

- Correct "whose turn is it" logic in both UIs
- Server-side enforcement of the "can't act on your own offer" rule
- Accurate notification routing on rejection

Existing rows pre-dating the migration have `createdById = null`; the `?? buyerId` fallback in the UI handles these gracefully.
