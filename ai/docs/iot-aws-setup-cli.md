# AWS IoT Setup — CLI Guide

This guide sets up everything AWS IoT needs for the BeOrchid IoT tool call feature using the AWS CLI. Run all commands from a terminal with `aws` configured for the correct account and region.

Replace `REGION`, `ACCOUNT_ID`, `YOUR_API_DOMAIN`, and `YOUR_WEBHOOK_SECRET` with your actual values throughout.

---

## Prerequisites

- AWS CLI v2 installed and configured (`aws configure`)
- IAM user with `AdministratorAccess` or scoped IoT + IAM permissions
- Backend deployed and publicly reachable over HTTPS

---

## Step 1 — Get the IoT Data endpoint

```bash
aws iot describe-endpoint \
  --endpoint-type iot:Data-ATS \
  --region REGION \
  --query 'endpointAddress' \
  --output text
```

Copy the output (e.g. `abc123-ats.iot.us-east-1.amazonaws.com`). This is your `IOT_DATA_ENDPOINT`.

---

## Step 2 — Create the device IoT policy

Each device certificate is attached to this policy at registration time. IoT policy variables (`${iot:Connection.Thing.ThingName}`) lock each device to its own topics.

```bash
aws iot create-policy \
  --region REGION \
  --policy-name "BeorchidDevicePolicy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "iot:Connect",
        "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:client/${iot:Connection.Thing.ThingName}"
      },
      {
        "Effect": "Allow",
        "Action": "iot:Subscribe",
        "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topicfilter/farm/*/devices/${iot:Connection.Thing.ThingName}/commands"
      },
      {
        "Effect": "Allow",
        "Action": "iot:Receive",
        "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topic/farm/*/devices/${iot:Connection.Thing.ThingName}/commands"
      },
      {
        "Effect": "Allow",
        "Action": "iot:Publish",
        "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topic/farm/*/devices/${iot:Connection.Thing.ThingName}/responses"
      }
    ]
  }'
```

Set `IOT_DEVICE_POLICY_NAME=BeorchidDevicePolicy` in your backend env. The backend calls `attachPolicy` on this during every `registerIotDevice` call.

---

## Step 3 — Create the IoT Rule (device responses → webhook)

This rule listens on the wildcard response topic and HTTP-forwards every message to your backend webhook.

```bash
aws iot create-topic-rule \
  --region REGION \
  --rule-name "BeorchidDeviceResponses" \
  --topic-rule-payload '{
    "sql": "SELECT * FROM '\''farm/+/devices/+/responses'\''",
    "description": "Forward device responses to backend webhook",
    "actions": [
      {
        "http": {
          "url": "https://YOUR_API_DOMAIN/v1/iot/webhook",
          "headers": [
            { "key": "x-iot-secret", "value": "YOUR_WEBHOOK_SECRET" },
            { "key": "Content-Type", "value": "application/json" }
          ]
        }
      }
    ],
    "errorAction": {
      "cloudwatchLogs": {
        "logGroupName": "/aws/iot/beorchid-rule-errors",
        "roleArn": "arn:aws:iam::ACCOUNT_ID:role/BeorchidIotRuleRole"
      }
    },
    "ruleDisabled": false,
    "awsIotSqlVersion": "2016-03-23"
  }'
```

> **Note:** The HTTP action requires the endpoint to be publicly reachable over HTTPS. For local development use a tunnel: `ngrok http 4000`.

### Create the error logging role (optional but recommended)

```bash
aws iam create-role \
  --role-name BeorchidIotRuleRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "iot.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam attach-role-policy \
  --role-name BeorchidIotRuleRole \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
```

---

## Step 4 — Attach IAM permissions to the backend user

The IAM user whose credentials are in `IOT_ACCESS_KEY_ID` / `IOT_SECRET_ACCESS_KEY` needs the following inline policy.

```bash
aws iam put-user-policy \
  --user-name YOUR_IAM_USER \
  --policy-name BeorchidIotBackendPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "IotManagement",
        "Effect": "Allow",
        "Action": [
          "iot:CreateThing",
          "iot:DeleteThing",
          "iot:CreateKeysAndCertificate",
          "iot:AttachThingPrincipal",
          "iot:DetachThingPrincipal",
          "iot:UpdateCertificate",
          "iot:DeleteCertificate",
          "iot:AttachPolicy",
          "iot:DescribeEndpoint"
        ],
        "Resource": "*"
      },
      {
        "Sid": "IotPublishCommands",
        "Effect": "Allow",
        "Action": "iot:Publish",
        "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topic/farm/*/devices/*/commands"
      }
    ]
  }'
```

---

## Step 5 — Environment variables

Add all of the following to your backend `.env` or deployment secrets:

```env
IOT_REGION=us-east-1
IOT_ACCESS_KEY_ID=<backend IAM user access key>
IOT_SECRET_ACCESS_KEY=<backend IAM user secret key>
IOT_DATA_ENDPOINT=<output from Step 1>
IOT_DEVICE_POLICY_NAME=BeorchidDevicePolicy
IOT_WEBHOOK_SECRET=<a strong random secret — must match the header in Step 3>
```

---

## Step 6 — Device firmware contract

The physical device connects to IoT Core using the certificate and private key returned by the `registerIotDevice` GraphQL mutation (download and store these once; they are cleared from the backend after the first read via `clearIotDeviceCert`).

**Receives** commands on:
```
farm/{farmId}/devices/{thingName}/commands
```

```json
{
  "tool_call_id": "uuid",
  "command_type": "IRRIGATE",
  "parameters": { "duration_minutes": 30 }
}
```

**Publishes** its result on:
```
farm/{farmId}/devices/{thingName}/responses
```

```json
{
  "tool_call_id": "uuid",
  "status": "COMPLETED",
  "response": { "liters_delivered": 45.2 }
}
```

The `tool_call_id` must be echoed back exactly as received. The backend matches it to the pending `IotToolCall` record, updates the status, and pushes an SSE event to any connected clients.

**Supported `status` values:** `COMPLETED`, `FAILED`

---

## Verification

1. Register a device via the `registerIotDevice` GraphQL mutation and download the certificate/key.
2. Activate it via `activateIotDevice`.
3. Connect the device to IoT Core using the certificate.
4. Call the `triggerIotDevice` GraphQL mutation.
5. Check the AWS IoT Core test client (MQTT test client in the console) — the command should appear on the `farm/{farmId}/devices/{thingName}/commands` topic.
6. Have the device publish a response. The backend webhook receives it, updates the `IotToolCall` status, and the SSE stream at `GET /v1/farm/{farmId}/iot/stream` emits a `tool_call_update` event.
