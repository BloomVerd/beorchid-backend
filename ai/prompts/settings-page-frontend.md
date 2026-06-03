# Settings Page — Frontend Implementation Guide

Build a **Settings** page for the BeOrchid farmer app. The page has four sections. All data is managed via GraphQL.

---

## GraphQL Operations

```graphql
query GetMySettings {
  getMySettings {
    id
    farmDataLookbackHours
    farmDataCacheTtlSeconds
    healthReportIntervalHours
    predictionWeeklyLimit
  }
}

mutation UpdateSettings($input: UpdateFarmerSettingsInput!) {
  updateSettings(input: $input) {
    id
    farmDataLookbackHours
    farmDataCacheTtlSeconds
    healthReportIntervalHours
    predictionWeeklyLimit
  }
}

mutation ChangePassword($input: ChangePasswordInput!) {
  changePassword(input: $input) {
    message
  }
}
```

---

## Page Behaviour

- Call `GetMySettings` on mount and pre-populate all fields
- Show skeleton loaders while the query is loading
- Each section has its own **Save** button that sends only that section's fields to `updateSettings`
- Show a loading spinner on the button while the mutation is in-flight
- On success: show a success toast ("Settings saved")
- On error: show an error toast with the server message

---

## Section 1 — Account Security

**Change Password** form with three fields:

| Field | Type | Validation |
|---|---|---|
| Current Password | password input | required |
| New Password | password input | required, min 8 characters |
| Confirm New Password | password input | must equal New Password |

- Validate `newPassword === confirmPassword` client-side before submitting
- On submit call `ChangePassword({ currentPassword, newPassword })`
- On success: show toast "Password updated successfully" and clear all three fields
- On 400 error from server ("Current password is incorrect"): show inline error under the Current Password field

---

## Section 2 — Farm Data Analysis

Controls the AI-powered farm dashboard widget.

| Setting | Input | Range | Label |
|---|---|---|---|
| `farmDataLookbackHours` | Number input or slider | 1–168 | "Sensor data window for AI analysis (hours)" |
| `farmDataCacheTtlSeconds` | Select | 600 / 1800 / 3600 / 7200 / 86400 | "Cache duration for farm analysis results" |

Display the select options as human-readable labels:
- 600 → "10 minutes"
- 1800 → "30 minutes"
- 3600 → "1 hour" (default)
- 7200 → "2 hours"
- 86400 → "24 hours"

Helper text: *"Controls how far back the AI looks at your sensor data and how long its analysis is cached before refreshing."*

---

## Section 3 — Health Reports

Controls how often automated farm health reports are generated.

| Setting | Input | Options | Label |
|---|---|---|---|
| `healthReportIntervalHours` | Select | 1 / 2 / 4 / 6 / 12 / 24 | "Health report refresh interval" |

Display options as human-readable labels (e.g. "Every 1 hour", "Every 2 hours", etc.)

Helper text: *"Your farm health is computed automatically in the background. The system checks for stale reports every 15 minutes and respects this interval."*

---

## Section 4 — AI Predictions

Controls the weekly prediction quota.

| Setting | Input | Range | Label |
|---|---|---|---|
| `predictionWeeklyLimit` | Select or number input | 1–10 | "Maximum AI prediction runs per week" |

Helper text: *"Each run uses AI credits to analyse your farm images. The default is 3 per week. Increasing this will consume more credits."*

---

## UX Notes

- All four sections can be displayed as stacked cards on a single scrollable page
- Use the authenticated user's JWT for all requests (same auth header as the rest of the app)
- The `UpdateSettings` input accepts only the fields being changed — you do not need to send all four fields at once; send only the section's fields on each save
- If `GetMySettings` returns null (first-time user), the backend will auto-create defaults — pre-populate the UI with the defaults (lookback: 1h, cache: 3600s, health interval: 1h, prediction limit: 3) while the query loads
