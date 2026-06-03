# IoT Tool Calls — Frontend Integration Guide

This document describes how to use the IoT tool call feature from the frontend. The feature lets a user (or the AI assistant) send commands to registered IoT devices (e.g. trigger irrigation), then watch the command status update in real time.

---

## Overview of the flow

```
1. User picks a device and a command
2. Frontend calls triggerIotDevice mutation → gets back a PENDING IotToolCall
3. Frontend opens an SSE connection for the farm
4. The physical device receives the command over MQTT, executes it, and sends a response
5. The backend receives the response via webhook and updates the IotToolCall status
6. The SSE connection delivers a tool_call_update event to the frontend
7. Frontend updates the UI to COMPLETED or FAILED
```

---

## Types

```typescript
type IotCommandType =
  | 'IRRIGATE'
  | 'STOP_IRRIGATION'
  | 'CAPTURE_IMAGE'
  | 'ACTIVATE_SENSOR'
  | 'DEACTIVATE_SENSOR';

type IotToolCallStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

interface IotToolCall {
  id: string;
  command_type: IotCommandType;
  parameters?: Record<string, unknown>; // JSON — shape depends on command_type
  status: IotToolCallStatus;
  response?: Record<string, unknown>;   // JSON — set by the device on completion
  requested_by: 'user' | 'ai';
  iot_device: {
    id: string;
    label: string;
    device_type: string;
    is_active: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// SSE event pushed on GET /v1/farm/:farmId/iot/stream
interface IotSseEvent {
  type: 'tool_call_update';
  farmId: string;
  toolCallId: string;
  status: IotToolCallStatus;
  response?: Record<string, unknown>;
}
```

---

## GraphQL operations

### Trigger a device command

```graphql
mutation TriggerIotDevice(
  $farmId: String!
  $deviceId: String!
  $input: TriggerIotDeviceInput!
) {
  triggerIotDevice(farmId: $farmId, deviceId: $deviceId, input: $input) {
    id
    command_type
    parameters
    status
    requested_by
    createdAt
    iot_device {
      id
      label
      device_type
    }
  }
}
```

**Variables:**
```json
{
  "farmId": "uuid",
  "deviceId": "uuid",
  "input": {
    "command_type": "IRRIGATE",
    "parameters": { "duration_minutes": 30 }
  }
}
```

The mutation returns immediately with `status: "PENDING"`. The device is contacted asynchronously — use the SSE stream to watch for the final status.

`parameters` is optional and its shape is command-specific:

| command_type | example parameters |
|---|---|
| `IRRIGATE` | `{ "duration_minutes": 30 }` |
| `STOP_IRRIGATION` | _(none needed)_ |
| `CAPTURE_IMAGE` | `{ "resolution": "high" }` |
| `ACTIVATE_SENSOR` | _(none needed)_ |
| `DEACTIVATE_SENSOR` | _(none needed)_ |

---

### List today's tool calls

Returns all `IotToolCall` records for a farm created in the last 24 hours, newest first.

```graphql
query ListIotToolCalls($farmId: String!, $page: Int, $limit: Int) {
  listIotToolCalls(farmId: $farmId, page: $page, limit: $limit) {
    data {
      id
      command_type
      parameters
      status
      response
      requested_by
      createdAt
      updatedAt
      iot_device {
        id
        label
        device_type
        is_active
      }
    }
    total
    page
    lastPage
  }
}
```

**Variables:**
```json
{
  "farmId": "uuid",
  "page": 1,
  "limit": 20
}
```

Use this to populate an activity feed or a command history panel when the page first loads. Then open the SSE stream (below) to receive live updates for any that are still `PENDING`.

---

## SSE connection — real-time status updates

Open a persistent SSE connection to receive `tool_call_update` events whenever a device responds.

**Endpoint:**
```
GET /v1/farm/:farmId/iot/stream?token=<JWT>
```

The `token` query parameter is the same JWT used for authenticated API calls — pass it directly. The connection stays open indefinitely until the client closes it.

### Example (vanilla JS)

```typescript
function connectIotStream(farmId: string, jwt: string) {
  const url = `/v1/farm/${farmId}/iot/stream?token=${encodeURIComponent(jwt)}`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    const data: IotSseEvent = JSON.parse(event.data);

    if (data.type === 'tool_call_update') {
      // Update the IotToolCall in your local state
      updateToolCallStatus(data.toolCallId, data.status, data.response);
    }
  };

  es.onerror = () => {
    es.close();
    // Reconnect after a short delay
    setTimeout(() => connectIotStream(farmId, jwt), 3000);
  };

  return () => es.close(); // return a cleanup function
}
```

### Example (React)

```typescript
import { useEffect } from 'react';

function useIotStream(
  farmId: string,
  jwt: string,
  onUpdate: (event: IotSseEvent) => void,
) {
  useEffect(() => {
    if (!farmId || !jwt) return;

    const url = `/v1/farm/${farmId}/iot/stream?token=${encodeURIComponent(jwt)}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      const data: IotSseEvent = JSON.parse(event.data);
      if (data.type === 'tool_call_update') {
        onUpdate(data);
      }
    };

    es.onerror = () => es.close();

    return () => es.close();
  }, [farmId, jwt]);
}
```

---

## End-to-end usage example

```typescript
async function startIrrigation(farmId: string, deviceId: string, jwt: string) {
  // 1. Send the command
  const { data } = await apolloClient.mutate({
    mutation: TRIGGER_IOT_DEVICE,
    variables: {
      farmId,
      deviceId,
      input: { command_type: 'IRRIGATE', parameters: { duration_minutes: 30 } },
    },
  });

  const toolCall: IotToolCall = data.triggerIotDevice;
  console.log('Command sent, status:', toolCall.status); // "PENDING"

  // 2. The SSE stream (opened once at the farm page level) will fire
  //    onUpdate when the device responds — no polling needed.
}

// In your farm page component:
useIotStream(farmId, jwt, (event) => {
  if (event.status === 'COMPLETED') {
    showSuccess(`Device finished. Response: ${JSON.stringify(event.response)}`);
  } else if (event.status === 'FAILED') {
    showError('Device command failed.');
  }

  // Refetch the list to show the updated record
  refetchIotToolCalls();
});
```

---

## UI recommendations

- **Open the SSE connection once** when the user lands on the farm page, not per command. Keep it alive for the whole session so updates for AI-triggered commands are also received.
- **Show a spinner or "Pending…" badge** on tool call rows that have `status === 'PENDING'`. Swap it to a checkmark or error icon when the SSE event arrives.
- **Seed the list from `listIotToolCalls`** on page load to show any commands that were issued before the user opened the page (including commands triggered by the AI assistant).
- **`requested_by`** is either `"user"` or `"ai"`. Use this to visually distinguish commands the AI issued on the user's behalf.
- **Do not poll** `listIotToolCalls` for status updates — use the SSE stream instead. Only refetch the list after a `tool_call_update` event arrives to get the full updated record including `response`.

---

## Error states

| Scenario | What happens |
|---|---|
| Device not found | `triggerIotDevice` throws a `BadRequestException` — show an error toast |
| Device is not active | Same — prompt the user to activate the device first via `activateIotDevice` |
| SSE disconnects | Reconnect automatically with a short delay (see example above) |
| Device command fails | SSE event arrives with `status: "FAILED"` — `response` may contain an error message from the device |
| No response from device | The `IotToolCall` stays `PENDING` indefinitely — consider showing a timeout warning after 60 seconds |
