# Farm Module

Manages the full lifecycle of a farmer's farms: creation (with subscription-enforced limits), multi-step setup (coordinates, photo, soil data), image management with prediction-range bucketing, IoT device provisioning on AWS IoT Core, device command dispatch via AWS IoT Jobs, and real-time job-status streaming over SSE.

---

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| `Farm` | `farms` | A farmer's registered plot of land |
| `Coordinate` | `coordinates` | Ordered boundary vertices that define the farm polygon |
| `ImageData` | `image_data` | A farm image stored on R2/S3, tagged with GPS and prediction types |
| `IotDevice` | `iot_devices` | An AWS IoT Core Thing registered to a farm |
| `IotToolCall` | `iot_tool_calls` | A command dispatched to an IoT device (by user or AI), with its status |

### Farm setup statuses

`PENDING` → `IN_PROGRESS` → `COMPLETE`

Each setup mutation (`updateFarmCoordinates`, `updateFarmPhoto`, `updateFarmSoilData`) advances the status from `PENDING` to `IN_PROGRESS` automatically. `completeSetup` sets it to `COMPLETE` and fires in-app, email, and SMS notifications.

### IoT tool call statuses

`PENDING` → `IN_PROGRESS` → `COMPLETED` / `FAILED`

---

## IoT Architecture

```
User / AI                Farm API              AWS IoT Core           IoT Device
    │                       │                       │                      │
    ├─triggerIotDevice() ──►│                       │                      │
    │                       │─IotToolCall (PENDING)─►                      │
    │                       │─createJob(jobId) ────►│                      │
    │                       │                       │──job notify─────────►│
    │                       │                       │                      │─execute command
    │                       │                       │◄─publish jobs/status─┤
    │                       │◄─IoT Rule HTTP POST───│                      │
    │                       │  handleIotWebhook()   │                      │
    │                       │─IotToolCall (DONE)    │                      │
    │                       │─pubSub.publish() ─────────────────────────►SSE client
```

### Device registration

`registerIotDevice` provisions a full AWS IoT Core identity:
1. Creates an IoT Thing (`farm_{farmId}_{deviceId}`)
2. Generates an X.509 certificate (initially inactive)
3. Attaches a scoped IAM policy (publish/subscribe to farm-specific MQTT topics)
4. Persists certificate PEM, private key, and public key in the database

`activateIotDevice` marks the certificate `ACTIVE` in AWS IoT Core so the device can connect. `clearIotDeviceCert` wipes the credentials from the database after they have been downloaded.

### Device package download

`GET /api/farm/:farmId/iot/:deviceId/download` returns a `.zip` archive containing the X.509 credentials, an IAM policy document, a `start.sh` launcher, and a pre-configured `index.ts` MQTT client that publishes telemetry and processes AWS IoT Jobs.

---

## IoT Webhook

AWS IoT Rules forward job-status updates to `POST /api/iot/webhook`. The route is secured by the `x-iot-secret` header (`IOT_WEBHOOK_SECRET`). After updating the `IotToolCall` record the server publishes the change to the farm's Redis SSE channel so connected clients receive real-time status updates.

`GET /api/iot/webhook?confirmationToken=` handles the AWS HTTPS destination confirmation handshake.

---

## GraphQL API

All operations require JWT authentication (`GqlJwtAuthGuard`).

### Queries

| Query | Description |
|-------|-------------|
| `listFarms(page, limit)` | Paginated list of the caller's farms |
| `getFarm(farmId)` | Single farm with coordinates, images, and IoT devices |
| `listIotToolCalls(farmId, page, limit)` | Paginated IoT commands from the last 24 hours |
| `listFarmImages(farmId, page, limit, year?, month?, week?)` | Paginated farm images with optional week filter |

### Mutations

| Mutation | Description |
|----------|-------------|
| `addFarm(input)` | Create a new farm (subject to subscription `maxFarms` limit) |
| `updateFarmCoordinates(farmId, input)` | Replace boundary coordinates; recomputes centroid lat/lon |
| `updateFarmPhoto(farmId, input)` | Set the setup photo URL and optional GPS coordinates |
| `updateFarmSoilData(farmId, input)` | Update soil type, crop density, and IoT device IDs |
| `completeSetup(farmId)` | Mark setup complete; dispatches notifications |
| `uploadFarmImages(farmId, input)` | Associate pre-uploaded S3 images with the farm and a prediction range |
| `registerIotDevice(farmId, input)` | Provision a new AWS IoT Thing and credentials |
| `activateIotDevice(farmId, deviceId)` | Activate the device certificate in AWS IoT Core |
| `clearIotDeviceCert(farmId, deviceId)` | Wipe stored credentials after download |
| `deleteIotDevice(farmId, deviceId)` | Detach, deactivate, delete the AWS Thing and remove the record |
| `triggerIotDevice(farmId, deviceId, input)` | Dispatch a command to an active IoT device via AWS IoT Jobs |
| `deleteFarmImage(farmId, imageId)` | Remove a farm image record |

---

## REST API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/farm/:farmId/iot/stream?token=` | JWT (query param) | SSE stream of IoT tool-call status updates for a farm |
| `GET` | `/api/farm/:farmId/iot/:deviceId/download?token=` | JWT (query param) | Download device credential ZIP archive |
| `GET` | `/api/iot/webhook?confirmationToken=` | — | AWS IoT HTTPS destination confirmation |
| `POST` | `/api/iot/webhook` | `x-iot-secret` header | AWS IoT Rule job-status callback |

---

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `IOT_REGION` | AWS region for IoT Core |
| `IOT_ACCESS_KEY_ID` | AWS access key with IoT + IAM permissions |
| `IOT_SECRET_ACCESS_KEY` | AWS secret access key |
| `IOT_DATA_ENDPOINT` | AWS IoT ATS endpoint (e.g. `xxx-ats.iot.us-east-1.amazonaws.com`) |
| `IOT_WEBHOOK_SECRET` | Shared secret for the IoT webhook (`x-iot-secret` header) |
| `APP_BASE_URL` | Public base URL used when creating the IoT Rule webhook URL |
| `S3_REGION` | R2/S3 region (`auto` for Cloudflare R2) |
| `S3_ENDPOINT` | R2/S3 endpoint URL |
| `S3_ACCESS_KEY_ID` | R2/S3 access key |
| `S3_SECRET_ACCESS_KEY` | R2/S3 secret key |
| `S3_BUCKET_PUBLIC` | R2/S3 bucket name |
