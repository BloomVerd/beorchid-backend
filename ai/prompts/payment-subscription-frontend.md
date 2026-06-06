# Payment & Subscription — Frontend Integration Guide

Integrate a tiered subscription system (Free / Popular / Premium) backed by Paystack into the BeOrchid farmer app. All subscription data is managed via GraphQL. Payment is handled by Paystack; the frontend proxies Paystack's webhook to the backend.

---

## Subscription Plans

Three plans are available. Fetch them (no auth required) to build the pricing/upgrade UI:

```graphql
query ListSubscriptionPlans {
  listSubscriptionPlans {
    id
    name          # "free" | "popular" | "premium"
    displayName   # "Free" | "Popular" | "Premium"
    priceAmount   # integer in Ghana pesewas — divide by 100 for GHS display
    currency      # "GHS"
    predictionWeeklyLimit
    farmDataLookbackSeconds
    healthReportIntervalSeconds
    maxFarms
    features      # string[] — marketing bullet points
  }
}
```

**Default values:**

| | Free | Popular | Premium |
|---|---|---|---|
| priceAmount (pesewas) | 0 | 200000 | 500000 |
| Display (÷ 100) | GHS 0 | GHS 2000/yr | GHS 5000/yr |
| durationDays | 0 (perpetual) | 365 | 365 |
| predictionWeeklyLimit | 3 | 15 | 50 |
| maxFarms | 2 | 10 | 50 |

---

## Current User's Subscription

Requires `Authorization: Bearer <accessToken>` on all authenticated operations.

```graphql
query GetMySubscription {
  getMySubscription {
    id
    status            # "active" | "expired" | "cancelled" | "pending"
    currentPeriodStart
    currentPeriodEnd  # null for free plan (never expires)
    plan {
      id
      name
      displayName
      priceAmount
      maxFarms
      predictionWeeklyLimit
      features
    }
  }
}
```

Old accounts without a subscription automatically receive a free plan on first call — no special case needed.

---

## Initiating Payment (Upgrade / Plan Change)

```graphql
mutation InitiateSubscriptionPayment($input: InitiatePaymentInput!) {
  initiateSubscriptionPayment(input: $input) {
    authorizationUrl  # Redirect user here to pay on Paystack's hosted page
    reference         # Keep for status polling if needed
  }
}
```

**Variables:**
```json
{ "input": { "planId": "<uuid of target plan>" } }
```

**Flow:**
1. Call the mutation.
2. If `authorizationUrl` is a non-empty string → redirect (or open in a new tab/modal) to that URL. Paystack collects payment.
3. Paystack calls the frontend webhook proxy (see below). The frontend forwards it to the backend.
4. The backend activates the subscription automatically.
5. On the Paystack callback return, re-query `getMySubscription` and show the updated plan.

**Immediate activation (downgrade with full credit):** If the remaining value of the current plan covers the new plan entirely, `authorizationUrl` is `""` and `reference` is `""` — the plan has already been switched. Re-query the subscription and show a success state.

---

## Proration Logic (Plan Changes)

The backend calculates all proration — the frontend does not need to compute anything.

- **Upgrade** (e.g. Popular → Premium): Credit for remaining days on current plan is deducted from the new plan's price. The Paystack page shows the reduced amount.
- **Downgrade with enough credit** (e.g. cancel Premium with 29 days remaining → Popular): No charge. `authorizationUrl` is `""`. The remaining credit extends the new plan's period.
- **Downgrade with insufficient credit**: Charged the prorated difference. Same redirect flow as upgrade.

---

## Paystack Webhook Proxy

Paystack sends `POST` webhook events to a single public URL configured in your Paystack dashboard. **The frontend app acts as the webhook proxy**: it receives the raw Paystack webhook, then forwards it — with the original headers intact — to the backend.

### Why the proxy is needed

The backend runs on an internal network and is not directly reachable from the public internet. The frontend (deployed on Vercel / Netlify / etc.) is. Paystack calls the frontend; the frontend relays to the backend.

### Frontend route to create

Create a server-side route (Next.js API route, Nuxt server route, or equivalent):

```
POST /api/paystack/webhook
```

This route must:
1. **Read the raw body as a `Buffer`** — do not parse it as JSON. The backend uses the raw bytes to verify the HMAC-SHA512 signature.
2. **Forward all Paystack headers** — especially `x-paystack-signature`.
3. **Proxy to the backend** at `POST <BACKEND_URL>/api/payment/webhook`.
4. Return Paystack's expected `200 OK` regardless of the backend response.

**Next.js App Router example (`app/api/paystack/webhook/route.ts`):**
```ts
export const config = { api: { bodyParser: false } };

export async function POST(req: Request) {
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get('x-paystack-signature') ?? '';

  await fetch(`${process.env.BACKEND_URL}/api/payment/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
    },
    body: rawBody,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

**Next.js Pages Router example (`pages/api/paystack/webhook.ts`):**
```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import getRawBody from 'raw-body';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawBody = await getRawBody(req);
  const signature = (req.headers['x-paystack-signature'] as string) ?? '';

  await fetch(`${process.env.BACKEND_URL}/api/payment/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
    },
    body: rawBody,
  });

  res.status(200).json({ ok: true });
}
```

### Paystack dashboard configuration

In your Paystack dashboard under **Settings → API Keys & Webhooks**, set the webhook URL to:

```
https://<your-frontend-domain>/api/paystack/webhook
```

---

## Paystack Callback (Return URL)

After the user completes or cancels payment on Paystack's hosted page, they are redirected back to your app. Configure this in the Paystack dashboard as the **callback URL**, e.g.:

```
https://<your-frontend-domain>/payment/callback
```

On that page:
1. Paystack appends `?reference=beorchid-xxxx-xxxxxxxx` to the URL — read it if needed for display.
2. Re-query `getMySubscription`. If `status` is `"active"` with the new plan, payment succeeded.
3. If the plan hasn't updated yet (webhook delivery can take a few seconds), show a "processing" state and poll `getMySubscription` every 3 seconds for up to 30 seconds.

---

## Error Handling

| GraphQL error | Cause |
|---|---|
| `"Cannot initiate payment for the free plan"` | `planId` points to the free plan |
| `"Subscription plan not found"` | Invalid or inactive `planId` |
| `UnauthorizedException` | Missing or expired JWT |

---

## Display Recommendations

- `priceAmount` is stored in pesewas (smallest unit). Format for display as `GHS ${(priceAmount / 100).toFixed(2)}` — e.g. `200000` → `GHS 2000.00`.
- Show `currentPeriodEnd` as a formatted date for paid plans. For free (`null`) show "No expiry".
- Disable the CTA button for the plan the user is already on.
- Disable the button immediately after calling the mutation to prevent double submissions.
- On the pricing page, highlight the user's current plan and show "Current plan" instead of an upgrade button.
