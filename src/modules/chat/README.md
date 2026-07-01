# Chat Module

Provides an AI-powered farm assistant chat experience. Farmers send a natural-language prompt about a specific farm; the message is queued to a BullMQ worker which calls the configured LLM with real-time farm context (health, IoT devices, predictions). Responses are streamed token-by-token to the client over SSE via a Redis pub/sub channel.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `Chat` | `chats` | A conversation thread between a farmer and the AI, scoped to one farm |
| `ChatMessage` | `chat_messages` | An individual message within a chat (user or assistant role) |

### Chat statuses

`processing` → `done` / `error`

---

## Architecture

```
Client                    API Server                  Worker
  │                          │                           │
  ├─POST /v1/chat/message ──►│                           │
  │   { prompt, farmId }     │  initiateMessage()        │
  │                          │  saves user ChatMessage   │
  │                          │  chat.status = processing │
  │◄── { chatId } ───────────│                           │
  │                          │  ChatProducer.enqueue() ──►│
  │                          │                           │ ClaudeService.streamAndProcess()
  │                          │                           │  ├─ LLM streaming (tool loop)
  │                          │                           │  ├─ pubSub.publish(token)
  │                          │                           │  └─ pubSub.publish(done)
  │                          │                           │
  ├─GET /v1/chat/:id/stream ─►│                           │
  │   ?token=<jwt>           │  ChatPubSubService        │
  │◄══ SSE events ═══════════│  subscribe(chatId)        │
  │    token | tool_use      │  (Redis SUBSCRIBE)        │
  │    done | error          │                           │
```

### LLM tool loop

`ClaudeService.streamAndProcess()` runs a multi-turn loop: it streams the LLM response, collecting any `tool_calls`, executes them against live farm data (health snapshot, predictions, IoT devices), appends tool results to the message history, and continues until `finish_reason !== "tool_calls"`. The final assistant text is saved as a `ChatMessage`.

### SSE race condition

If the LLM finishes before the client connects to the SSE stream, `GET /:chatId/stream` detects the completed message (`chat.status === "done"`) and immediately sends the full content + a `done` event without subscribing to Redis.

---

## Available LLM Tools

| Tool | Description |
|------|-------------|
| `get_farm_health` | Latest health snapshot (scores, alerts, sensor history) |
| `get_predictions` | Recent disease/yield predictions |
| `get_iot_devices` | Registered IoT devices and their active status |
| `get_farm_details` | Farm metadata (crop, size, soil type, coordinates) |
| `trigger_iot_device` | Send a command to an IoT device (IRRIGATE, CAPTURE_IMAGE, etc.) |

---

## REST API

All endpoints require JWT authentication. The SSE stream endpoint accepts the token as a query parameter (`?token=`) because `EventSource` browsers cannot set `Authorization` headers.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/message` | Send a prompt; returns `{ chatId }` immediately |
| `GET` | `/v1/chat/:chatId/stream?token=` | SSE stream of token deltas for a chat |
| `GET` | `/v1/chat/:chatId/messages` | All completed messages in a chat |
| `GET` | `/v1/chat?page&limit` | Paginated list of the caller's chat threads |
| `DELETE` | `/v1/chat/:chatId` | Delete a chat and all its messages |

### SSE event shapes

```json
{ "type": "token",    "chatId": "…", "delta": "word " }
{ "type": "tool_use", "chatId": "…", "toolName": "get_farm_health" }
{ "type": "done",     "chatId": "…", "messageId": "…" }
{ "type": "error",    "chatId": "…", "message": "…" }
```

---

## GraphQL API

| Query | Auth | Description |
|-------|------|-------------|
| `getChats(page, limit)` | JWT | Paginated list of the caller's chat threads |

---

## Queue

| Queue | Job | Processor |
|-------|-----|-----------|
| `chat-queue` | `process-chat-message` | `ChatConsumer` — runs LLM tool loop, publishes SSE events |
