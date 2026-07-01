# Email Module

Asynchronous transactional email delivery via a BullMQ queue. Callers enqueue jobs through `EmailProducer`; `EmailProcessor` dequeues and dispatches them using `EmailService`, which compiles Handlebars templates and sends via Gmail (production) or Ethereal (development/test).

---

## Architecture

```
Caller                EmailProducer           EmailProcessor        EmailService
  │                       │                        │                    │
  ├─sendWelcomeEmail() ──►│                        │                    │
  │                       │─add('welcome-email')──►│                    │
  │                       │                        │─sendWelcomeEmail()►│
  │                       │                        │                    │─compile template
  │                       │                        │                    │─transporter.sendMail()
```

`EmailModule` exports only `EmailProducer` — callers never interact with `EmailService` directly.

---

## Email Templates

Templates are Handlebars (`.hbs`) files compiled at send time. All templates live in `src/modules/email/templates/`.

| Template | Job name | Variables | Subject |
|----------|----------|-----------|---------|
| `magic-link.hbs` | `send-magic-link` | `firstName`, `link` | Your magic link to sign in |
| `welcome.hbs` | `welcome-email` | `firstName` | Welcome to BeOrchid! |
| `farm-setup-complete.hbs` | `farm-setup-complete` | `firstName`, `farmName` | `{farmName}` setup is complete |
| `health-alert.hbs` | `health-alert` | `firstName`, `farmName`, `summary` | Health Alert — `{farmName}` |
| `prediction-alert.hbs` | `prediction-alert` | `firstName`, `farmName`, `summary` | Prediction Alert — `{farmName}` |
| `subscription-activated.hbs` | `subscription-activated` | `firstName`, `planName`, `summary` | Your `{planName}` plan is now active |
| `super-admin-credentials.hbs` | `super-admin-credentials` | `firstName`, `email`, `password` | Your BeOrchid Super Admin credentials |

---

## Queue

| Queue | Job names | Processor |
|-------|-----------|-----------|
| `email` | `send-magic-link`, `welcome-email`, `farm-setup-complete`, `health-alert`, `prediction-alert`, `subscription-activated`, `super-admin-credentials` | `EmailProcessor` |

---

## Transport Configuration

| `STAGE` value | Transport |
|---------------|-----------|
| `production` | Gmail SMTP via `GMAIL_USER` + `GMAIL_APP_PASSWORD` |
| anything else | Ethereal (auto-created test account; preview URL logged to console) |

### Required environment variables (production)

| Variable | Purpose |
|----------|---------|
| `GMAIL_USER` | Gmail address to send from |
| `GMAIL_APP_PASSWORD` | Gmail app password |
| `EMAIL_FROM` | `From` header value (e.g. `"BeOrchid <noreply@beorchid.com>"`) |
| `STAGE` | Set to `production` to activate Gmail transport |
