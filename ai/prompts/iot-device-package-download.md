# IoT Device Package Download — Frontend Integration Guide

This document describes how to integrate the IoT device package download into the frontend. After registering a device, the user downloads a `.zip` containing everything needed to run the device client: certificates, private key, policy document, and ready-to-run scripts.

---

## Overview of the flow

```
1. User registers a device via registerIotDevice mutation
2. Backend returns the IotDevice with certificate_pem, private_key, public_key set
3. Frontend immediately shows a "Download Package" button
4. User clicks download → frontend calls GET /v1/farm/:farmId/iot/:deviceId/download?token=<jwt>
5. Browser downloads farm_<farmId>_<deviceId>.zip
6. Frontend calls clearIotDeviceCert to remove key material from the server
7. User activates the device via activateIotDevice when ready to go live
```

> **Critical:** `certificate_pem`, `private_key`, and `public_key` are returned ONLY on the initial `registerIotDevice` response. After `clearIotDeviceCert` is called (or the user navigates away without downloading), they are gone. Show the download button immediately and make it prominent.

---

## Download endpoint

```
GET /v1/farm/:farmId/iot/:deviceId/download?token=<jwt>
```

| Parameter | Description |
|---|---|
| `:farmId` | The farm UUID |
| `:deviceId` | The `device_id` field on `IotDevice` — **not** the `id` primary key |
| `?token=` | The user's JWT (same token used for GraphQL requests) |

**Response:** `application/zip`, `Content-Disposition: attachment; filename=farm_<farmId>_<deviceId>.zip`

**Zip contents:**

| File | Description |
|---|---|
| `farm_<farmId>_<deviceId>-Policy` | AWS IoT policy JSON |
| `farm_<farmId>_<deviceId>.cert.pem` | Device certificate |
| `farm_<farmId>_<deviceId>.private.key` | Private key |
| `farm_<farmId>_<deviceId>.public.key` | Public key |
| `start.sh` | Shell script — installs the AWS SDK and starts publishing sensor data |
| `index.ts` | TypeScript MQTT5 client with sensor data simulation |

---

## GraphQL operations needed

### Register device (existing — returns cert material)

```graphql
mutation RegisterIotDevice($farmId: String!, $input: RegisterIotDeviceInput!) {
  registerIotDevice(farmId: $farmId, input: $input) {
    id
    device_id
    label
    device_type
    is_active
    registered_at
    certificate_pem
    private_key
    public_key
  }
}
```

Check `certificate_pem !== null` to know whether the download is still available.

### Clear cert material after download

Call this once the user has successfully downloaded the package. It removes the private key and certificates from the server.

```graphql
mutation ClearIotDeviceCert($farmId: String!, $deviceId: String!) {
  clearIotDeviceCert(farmId: $farmId, deviceId: $deviceId)
}
```

`deviceId` here is the `id` field (primary key), not `device_id`.

### Activate device

```graphql
mutation ActivateIotDevice($farmId: String!, $deviceId: String!) {
  activateIotDevice(farmId: $farmId, deviceId: $deviceId) {
    id
    is_active
  }
}
```

---

## Download implementation

Trigger a browser file download without navigating away from the page:

```typescript
async function downloadIotPackage(
  farmId: string,
  deviceId: string,  // IotDevice.device_id — NOT IotDevice.id
  jwt: string,
): Promise<void> {
  const url = `/v1/farm/${farmId}/iot/${deviceId}/download?token=${encodeURIComponent(jwt)}`;

  const res = await fetch(url);

  if (res.status === 401) throw new Error('Session expired. Please log in again.');
  if (res.status === 400) {
    const body = await res.json();
    throw new Error(body.message ?? 'Device not found.');
  }
  if (!res.ok) throw new Error('Download failed. Please try again.');

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `farm_${farmId}_${deviceId}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
```

---

## React example — post-registration download flow

```typescript
import { useState } from 'react';
import { useMutation } from '@apollo/client';

function RegisterDevicePanel({ farmId, jwt }: { farmId: string; jwt: string }) {
  const [newDevice, setNewDevice] = useState<IotDevice | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [registerDevice] = useMutation(REGISTER_IOT_DEVICE);
  const [clearCert] = useMutation(CLEAR_IOT_DEVICE_CERT);
  const [activateDevice] = useMutation(ACTIVATE_IOT_DEVICE);

  async function handleRegister(label: string, deviceType: string) {
    const { data } = await registerDevice({
      variables: { farmId, input: { label, device_type: deviceType } },
    });
    setNewDevice(data.registerIotDevice);
    setDownloaded(false);
  }

  async function handleDownload() {
    if (!newDevice) return;
    setDownloading(true);
    try {
      await downloadIotPackage(farmId, newDevice.device_id, jwt);
      setDownloaded(true);
      // Remove key material from server after successful download
      await clearCert({ variables: { farmId, deviceId: newDevice.id } });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  async function handleActivate() {
    if (!newDevice) return;
    await activateDevice({ variables: { farmId, deviceId: newDevice.id } });
  }

  if (!newDevice) {
    return <RegisterForm onSubmit={handleRegister} />;
  }

  return (
    <div>
      <p>Device <strong>{newDevice.label}</strong> registered.</p>

      {newDevice.certificate_pem && !downloaded && (
        <div className="alert alert-warning">
          <p>Download the device package before leaving this page. The private key will not be available again.</p>
          <button onClick={handleDownload} disabled={downloading}>
            {downloading ? 'Downloading…' : 'Download Package'}
          </button>
        </div>
      )}

      {downloaded && (
        <div>
          <p>Package downloaded. Run <code>start.sh</code> on your device to begin.</p>
          <button onClick={handleActivate}>Activate Device</button>
        </div>
      )}
    </div>
  );
}
```

---

## UX recommendations

- **Show the download prompt immediately** after `registerIotDevice` resolves — before the user can navigate away. Use a modal or a sticky banner if necessary.
- **Disable navigation** (or show a "are you sure?" warning) while the download is still pending. Use `beforeunload` if needed.
- **Call `clearIotDeviceCert` immediately after a successful download**, not on unmount. If the component unmounts before clearing (e.g. the user refreshes), the cert stays on the server but the user already has the zip — that is acceptable.
- **Show `certificate_pem !== null`** on any device card to indicate "package not yet downloaded". Show a warning badge if the device is registered but not yet downloaded and not yet active.
- **Do not re-download** from the server after `clearIotDeviceCert` — the endpoint will return the zip with empty cert files. The user must register a new device if they lose the zip.
- **The `start.sh` file is executable** (`chmod 755`) inside the zip. Remind users to run `chmod +x start.sh` on macOS/Linux if their zip client strips permissions.

---

## Error states

| HTTP status | Cause | Suggested handling |
|---|---|---|
| `401` | Token missing, expired, or invalid | Redirect to login |
| `400` | `device_id` not found or belongs to a different farm/farmer | Show error toast |
| `500` | Unexpected server error | Show generic retry message |

---

## State machine for a newly registered device

```
REGISTERED (cert available)
  → user downloads package → clearIotDeviceCert called → CERT_CLEARED
  → user activates → is_active: true → ACTIVE

REGISTERED (cert available, user navigates away without downloading)
  → cert still on server (not cleared) → REGISTERED (cert available)
  → user can still download from the device list if certificate_pem is not null
```

If `certificate_pem` is `null` and the device is not yet active, surface a "Re-register device" option so the user can create a new device to get a fresh certificate.
