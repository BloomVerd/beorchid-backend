# SMS Module

Sends transactional SMS messages via the Twilio API. Exported so health, prediction, and
farm services can send SMS notifications without taking a direct Twilio dependency.

## Architecture

```
Health / Prediction / Farm service
          │
    SmsService.send*()
          │
    Twilio client
          │
    SMS delivered to farmer's phone
```

No queue is used — SMS is dispatched synchronously within the calling worker's job context.
If Twilio credentials are absent (`TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN` not set) the
client is never initialized and every `send*()` call logs a warning and returns immediately.

## Methods

| Method                     | Message format                                           | Trigger                          |
|----------------------------|----------------------------------------------------------|----------------------------------|
| `sendPredictionAlert`      | `[BeOrchid] {farmName}: {summary}`                      | Prediction worker (high/moderate risk) |
| `sendHealthAlert`          | `[BeOrchid Health] {farmName}: {summary}`               | Health worker (CRITICAL/WARNING) |
| `sendSubscriptionActivated`| `[BeOrchid] Your {planName} plan is now active.`        | Payment webhook                  |
| `sendFarmSetupComplete`    | `[BeOrchid] {farmName} setup is complete. …`            | Farm service (completeSetup)     |

All methods are gated by `FarmerSettings.notifySms` and `FarmerSettings.smsPhoneNumber`
in the calling service — `SmsService` itself has no settings awareness.

## Environment variables

| Variable              | Purpose                              |
|-----------------------|--------------------------------------|
| `TWILIO_ACCOUNT_SID`  | Twilio Account SID                   |
| `TWILIO_AUTH_TOKEN`   | Twilio Auth Token                    |
| `TWILIO_FROM_NUMBER`  | Sender phone number (E.164 format)   |
