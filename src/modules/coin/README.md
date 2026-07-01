# Coin Module

Provides crop-backed digital coins that investors can buy and sell. Each coin's price is dynamically recomputed from real crop market data using a weighted formula, and recomputation is triggered automatically whenever new price observations are ingested.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `Coin` | `coins` | A crop-backed coin definition with base price and pricing weights |
| `CoinPricePoint` | `coin_price_points` | Historical computed prices with full input audit |
| `CoinHolding` | `coin_holdings` | A user's current coin position (units + VWAP avg cost) |
| `CoinTransaction` | `coin_transactions` | Individual buy/sell trade records |

### Coin statuses

`DRAFT` → `ACTIVE` → `PAUSED` → `DELISTED`

Only `ACTIVE` coins can be bought. Coins that are not `DELISTED` can be sold.

---

## Pricing formula

Price is recomputed by `CoinPricingService.recompute()`:

```
multiplier = 1
  + w_trend  × normalizedPriceChange   (30-day vs 60–30-day avg, clamped ±1)
  + w_demand × demandFactor            (reserved, currently 0)
  + w_health × normalizedAvgFarmHealth (reserved, currently 0)
  + w_vol    × volatilityAdjustment    (stddev/avg, negative dampener)

multiplier = clamp(multiplier, 0.25, 4.0)
newPrice   = round(basePrice × multiplier)
```

Default weights: `w_trend=0.3, w_demand=0.2, w_health=0.3, w_vol=0.2`. Weights are stored per-coin in the `pricingWeights` JSONB column and can be customised.

Each recomputation saves a `CoinPricePoint` with a full `inputs` JSONB audit snapshot and updates `coin.currentPrice`.

---

## Recompute trigger chain

```
New market price point ingested
  (via field observation approval or ingestion job)
        │
        ▼
coin-price-recompute BullMQ job enqueued { cropId }
        │
        ▼
CoinRecomputeConsumer
  → pricingService.recomputeForCrop(cropId)
  → recompute() for every coin linked to that crop
```

Admins can also trigger a manual recompute via `recomputeCoinPrice(coinId)`.

---

## Buy / Sell

All trades run inside a transaction with a pessimistic write lock on the `Coin` row.

**Buy** (`units`):
1. `debit(investorWallet, units × currentPrice, COIN_POOL)`
2. Upsert `CoinHolding` — updates `units` and recalculates VWAP `avgCost`
3. Increments `coin.circulatingSupply`
4. Creates a `CoinTransaction` (side: BUY)

**Sell** (`units`):
1. Validates `holding.units >= units`
2. `credit(investorWallet, units × currentPrice, USER_CASH)`
3. Decrements `holding.units` and `coin.circulatingSupply`
4. Creates a `CoinTransaction` (side: SELL)

Both mutations require an `idempotencyKey` (client-supplied, for deduplication at the application layer).

---

## P&L (`myCoins`)

`myHoldings()` returns `CoinHoldingWithPnl` for each position:

```
currentValue   = units × coin.currentPrice
cost           = units × holding.avgCost
unrealizedPnl  = currentValue − cost
```

---

## GraphQL API

### Public queries (JWT required)

| Query | Description |
|-------|-------------|
| `coins` | List all coins |
| `coin(id)` | Single coin by ID |
| `coinPrices(coinId, from?, to?)` | Historical price points for a coin |
| `myCoins` | Caller's holdings with unrealised P&L |

### Investor mutations (JWT required)

| Mutation | Description |
|----------|-------------|
| `buyCoin(coinId, units, idempotencyKey)` | Purchase coin units |
| `sellCoin(coinId, units, idempotencyKey)` | Sell coin units |

### Admin mutations (`super_admin`)

| Mutation | Description |
|----------|-------------|
| `createCoin(input)` | Create a new coin in DRAFT status |
| `updateCoinStatus(id, status)` | Transition coin status |
| `recomputeCoinPrice(coinId)` | Manually trigger a price recompute |

---

## Money amounts

All price values (`basePrice`, `currentPrice`, `unitPrice`, `grossAmount`, `avgCost`) are in **pesewas** (GHS × 100).
