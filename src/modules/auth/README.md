# Auth Module

Handles all authentication flows: password-based login, passwordless magic-link login, Google OAuth 2.0, JWT access-token issuance, refresh-token rotation, logout, and in-session password changes. Issues short-lived JWT access tokens (24 h) paired with longer-lived refresh tokens (7 days) stored as SHA-256 hashes in the database.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `MagicLinkToken` | `magic_link_tokens` | Single-use, time-limited token for passwordless sign-in |
| `RefreshToken` | `refresh_tokens` | Hashed refresh token tied to a `Farmer` for token rotation |

---

## Authentication Flows

### Password login
```
loginWithPassword(email, password)
  → query Farmer with passwordHash selected
  → bcrypt compare
  → issueTokens → { accessToken (JWT 24h), refreshToken (raw, 7d) }
```

### Magic-link (passwordless)
```
sendMagicLink(email)
  → generate 32-byte random token
  → SHA-256 hash stored in magic_link_tokens (expires 15 min)
  → raw token sent via email as a query-param URL

verifyMagicLink(rawToken)
  → SHA-256 hash lookup
  → check not used, not expired
  → mark usedAt, issue tokens
```

### Google OAuth
```
GET /v1/auth/google           → redirect to Google consent screen
GET /v1/auth/google/callback  → GoogleStrategy validates profile
  → upsert Farmer (create if new, link googleId if existing account)
  → redirect to FRONTEND_URL/auth/callback?accessToken=…&refreshToken=…
```

### Token refresh & logout
```
refresh(rawRefreshToken)
  → SHA-256 hash lookup + expiry check
  → delete old record (rotation)
  → issue new token pair

logout(rawRefreshToken)
  → delete refresh token record by hash
```

---

## Token Model

| Token | Storage | Lifetime | Hashing |
|-------|---------|----------|---------|
| Access (JWT) | Client only | 24 hours | Signed with `JWT_SECRET` |
| Refresh | `refresh_tokens` table | 7 days | SHA-256 before DB write |
| Magic-link | `magic_link_tokens` table | 15 minutes | SHA-256 before DB write |

Raw tokens are never stored — only their SHA-256 digest — so a database compromise does not expose usable credentials.

---

## GraphQL API

No authentication required unless noted.

### Mutations

| Mutation | Auth | Description |
|----------|------|-------------|
| `register(input)` | — | Create a new account, send welcome email, assign free plan |
| `loginWithPassword(email, password)` | — | Password-based login |
| `sendMagicLink(email, redirectBase?)` | — | Email a 15-minute magic-link |
| `verifyMagicLink(token)` | — | Exchange a raw magic-link token for a session |
| `refresh(refreshToken)` | — | Rotate a refresh token and issue a new pair |
| `logout(refreshToken)` | JWT | Invalidate a refresh token |
| `changePassword(input)` | JWT | Verify current password and set a new one |

---

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/auth/google` | Initiates Google OAuth redirect |
| `GET` | `/v1/auth/google/callback` | Google OAuth callback; redirects to frontend with tokens |

---

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs JWT access tokens |
| `FRONTEND_URL` | Base URL for magic-link and OAuth redirect targets |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_SECRET` | Google OAuth app client secret |
| `GOOGLE_CALLBACK_URL` | Absolute URL for the OAuth callback endpoint |
