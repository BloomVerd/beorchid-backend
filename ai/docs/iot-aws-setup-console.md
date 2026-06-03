# AWS IoT Setup — Console Guide

This guide sets up everything AWS IoT needs for the BeOrchid IoT tool call feature using the AWS Management Console.

---

## Prerequisites

- AWS account with IAM access
- Backend deployed and publicly reachable over HTTPS
- You are signed in to the AWS Console in the correct region

---

## Step 1 — Get the IoT Data endpoint

1. Open the AWS Console and navigate to **IoT Core**.
2. In the left sidebar, click **Settings**.
3. Under **Device data endpoint**, copy the **Endpoint** value.
   It looks like: `abc123-ats.iot.us-east-1.amazonaws.com`

Set this as `IOT_DATA_ENDPOINT` in your backend environment.

---

## Step 2 — Create the device IoT policy

This policy is attached to every device certificate at registration time. IoT policy variables lock each device to its own MQTT topics.

1. In **IoT Core**, go to **Security → Policies** in the left sidebar.
2. Click **Create policy**.
3. Set **Policy name** to `BeorchidDevicePolicy`.
4. Switch to the **JSON** editor and paste the following, replacing `REGION` and `ACCOUNT_ID`:

```json
{
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
}
```

5. Click **Create**.

Set `IOT_DEVICE_POLICY_NAME=BeorchidDevicePolicy` in your backend environment. The backend will attach this policy to every new certificate automatically.

---

## Step 3 — Create the IoT Rule (device responses → webhook)

This rule forwards device response messages to the backend webhook endpoint.

1. In **IoT Core**, go to **Message routing → Rules** in the left sidebar.
2. Click **Create rule**.
3. Set **Rule name** to `BeorchidDeviceResponses` and an optional description, then click **Next**.

### Configure the SQL statement

4. In the **SQL statement** field, enter:
   ```sql
   SELECT * FROM 'farm/+/devices/+/responses'
   ```
   Leave the SQL version as `2016-03-23`. Click **Next**.

### Add the rule action

5. Under **Rule actions**, choose **HTTP** from the action type dropdown.
6. Fill in:
   - **URL:** `https://YOUR_API_DOMAIN/v1/iot/webhook`
   - Click **Add header** twice and add:
     | Key | Value |
     |-----|-------|
     | `x-iot-secret` | `YOUR_WEBHOOK_SECRET` |
     | `Content-Type` | `application/json` |
7. Click **Next**.

> **Note:** The endpoint must be publicly reachable over HTTPS. For local development, use a tunnel such as `ngrok http 4000` and use the ngrok HTTPS URL.

### Configure the error action (recommended)

8. Under **Error action**, choose **CloudWatch Logs**.
9. Set **Log group name** to `/aws/iot/beorchid-rule-errors`.
10. For **IAM role**, click **Create new role**, name it `BeorchidIotRuleRole`, and click **Create**. AWS will provision the role automatically.
11. Click **Next**, review, then click **Create rule**.

---

## Step 4 — Add IAM permissions to the backend user

The IAM user whose keys are stored in `IOT_ACCESS_KEY_ID` / `IOT_SECRET_ACCESS_KEY` needs the following permissions.

1. Navigate to **IAM → Users** and select your backend IAM user.
2. Click **Add permissions → Attach policies directly**.
3. Click **Create policy** (opens a new tab).
4. Switch to the **JSON** editor and paste the following, replacing `REGION` and `ACCOUNT_ID`:

```json
{
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
}
```

5. Click **Next**, set **Policy name** to `BeorchidIotBackendPolicy`, then click **Create policy**.
6. Back in the user permissions tab, refresh the policy list, search for `BeorchidIotBackendPolicy`, check it, and click **Add permissions**.

---

## Step 5 — Environment variables

Add all of the following to your backend `.env` or deployment secrets:

```env
IOT_REGION=us-east-1
IOT_ACCESS_KEY_ID=<backend IAM user access key>
IOT_SECRET_ACCESS_KEY=<backend IAM user secret key>
IOT_DATA_ENDPOINT=<output from Step 1>
IOT_DEVICE_POLICY_NAME=BeorchidDevicePolicy
IOT_WEBHOOK_SECRET=<a strong random secret — must match the x-iot-secret header in Step 3>
```

---

## Step 6 — Device firmware contract

The physical device connects to IoT Core using the certificate and private key returned by the `registerIotDevice` GraphQL mutation. Download and store these on the device once — the backend clears them after `clearIotDeviceCert` is called.

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

The `tool_call_id` must be echoed back exactly as received so the backend can match the response to the pending `IotToolCall` record and update its status.

**Supported `status` values:** `COMPLETED`, `FAILED`

---

## Verification

1. Register a device via the `registerIotDevice` GraphQL mutation and save the returned certificate and private key to the device.
2. Activate it via the `activateIotDevice` mutation.
3. Connect the device to IoT Core.
4. Call the `triggerIotDevice` GraphQL mutation.
5. In **IoT Core → Test → MQTT test client**, subscribe to `farm/#` and confirm the command message appears.
6. Have the device publish a response on its responses topic. The backend webhook updates the `IotToolCall` status and the SSE stream at `GET /v1/farm/{farmId}/iot/stream` emits a `tool_call_update` event.

### Checking the IoT Rule is firing

- Go to **IoT Core → Message routing → Rules → BeorchidDeviceResponses**.
- The **Metrics** tab shows invocation count and errors.
- If the HTTP action fails, check **CloudWatch → Log groups → /aws/iot/beorchid-rule-errors** for the error details.
