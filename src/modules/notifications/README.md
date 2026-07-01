# Notifications Module

Async notification delivery with BullMQ queuing and Server-Sent Events (SSE) live-push.

---

## Architecture

```
Caller (any module)
  └─ NotificationsProducer.notify(farmerId, dto, pushToStream?)
       └─ BullMQ: notifications queue
            └─ NotificationsConsumer.process(job)
                 ├─ NotificationsService.create()  → DB row
                 └─ [if pushToStream] NotificationsService.pushToStream()
                      └─ Subject<Notification> (in-memory per farmer)
                           └─ NotificationsController SSE stream → client EventSource
```

### Key design decisions

- **Queue-first**: All notifications go through BullMQ, decoupling producers from delivery and providing retry/dead-letter behaviour.
- **`pushToStream` flag**: `NotificationsProducer.notify()` defaults to `pushToStream = false` (DB-only). Pass `true` for real-time in-app delivery (e.g. marketplace offer updates, deal confirmations). This is the flag that was missing from all original marketplace service calls — forgetting it means notifications are persisted but never appear live.
- **SSE over WebSockets**: Uses NestJS `@Sse` (HTTP/1.1 chunked) rather than WebSockets. EventSource does not support custom headers, so the JWT is passed as a query parameter (`?token=<jwt>`).
- **In-memory subjects**: Each connected farmer gets an RxJS `Subject<Notification>`. Subjects are cleaned up via the `finalize` RxJS operator when the client disconnects. This means live delivery requires the farmer to be connected — offline farmers get the notification only from DB polling.

---

## Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `Notification` | `notifications` | Persisted notification row with `isRead` flag |

### NotificationType values

| Type | Trigger |
|------|---------|
| `OFFER` | New or counter offer on a listing |
| `DEAL` | Offer accepted, deal created |
| `PAYMENT` | Payment / escrow confirmation |
| `SUBSCRIPTION_ACTIVATED` | Subscription plan activated |
| `SYSTEM` | Platform-level announcements |

---

## SSE endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /notifications/stream?token=<jwt>` | Opens SSE stream for the authenticated farmer |
| `GET /notifications/:id/read?token=<jwt>` | Marks a notification as read (token-in-query for EventSource compatibility) |

---

## GraphQL API

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `getMyNotifications(page?, limit?)` | Query | JWT | Paginated notifications, newest first (default: page 1, limit 20) |
| `markNotificationRead(notificationId)` | Mutation | JWT | Marks a single notification as read |

---

## Producer usage (other modules)

```typescript
// DB-only (notification stored but not pushed live)
await this.notificationsProducer.notify(farmerId, {
  title: 'New offer',
  message: 'You have received a new offer.',
  type: NotificationType.OFFER,
});

// DB + live SSE push
await this.notificationsProducer.notify(farmerId, {
  title: 'Offer accepted',
  message: 'Your offer has been accepted.',
  type: NotificationType.DEAL,
}, true);  // ← pushToStream must be true for live delivery
```

---

## Exports

`NotificationsService` and `NotificationsProducer` are exported for use by:
- `MarketplaceModule` — offer/deal notifications
- `PaymentModule` — subscription activation notifications
- `HealthModule` — farm health alert notifications
