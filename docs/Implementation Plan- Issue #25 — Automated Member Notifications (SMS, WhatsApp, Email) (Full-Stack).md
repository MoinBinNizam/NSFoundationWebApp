# Implementation Plan — Issue #25: Automated Member Notifications (SMS, WhatsApp, Email) (Full-Stack)

## Goal

Automate timely, auditable member communication across Bangladesh SMS gateways, WhatsApp, and Email for payment receipt confirmations, monthly contribution deadline reminders, late penalty notices, and annual report releases without blocking primary financial transactions.

---

## Scope

- Modular notification service architecture with swappable provider adapters:
  - Bangladesh SMS gateways (e.g. Greenweb, SSL Wireless, Onnorokom SMS).
  - WhatsApp Business API or webhook provider.
  - Transactional Email (SMTP / Nodemailer / Resend).
  - Mock / In-memory provider for local development and testing.
- Event triggers:
  - **Payment Confirmation:** Immediate receipt notice with payment amount, months credited, remaining dues, and receipt link.
  - **Monthly Due Reminder:** Scheduled automated reminders sent on the 10th and 14th of the month to members who haven't yet paid.
  - **Late Penalty Alert:** Notice sent on the 16th of the month when late penalty is assessed.
  - **Annual Report Announcement:** Notification sent when an accounting year is finalized and published.
- Notification logging and delivery audit trail in MongoDB (`NotificationLog`).
- Admin UI in `SettingsPage` to toggle channels, update API credentials, and customize message templates in English and Bangla.

---

## Architecture & Integration Flow

```text
┌───────────────────────────────────────┐
│     Financial Event / Cron Job        │
│ (Payment Saved / 14th of Month Cron)  │
└───────────────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────┐
│      Notification Dispatcher          │
│ - Resolves member phone / email       │
│ - Compiles dynamic template           │
│ - Dispatches asynchronously (Worker)  │
└───────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌──────────────────┐  ┌──────────────────┐
│   SMS Gateway    │  │   Email / SMTP   │
│ (Greenweb / SSL) │  │   (Nodemailer)   │
└──────────────────┘  └──────────────────┘
         │                   │
         └─────────┬─────────┘
                   ▼
┌───────────────────────────────────────┐
│    NotificationLog (MongoDB Audit)    │
│ - Recipient, channel, content, status │
└───────────────────────────────────────┘
```

---

## Detailed Implementation Tasks

### 1. Data Model: `NotificationLog`
Create `backend/src/models/NotificationLog.ts`:
- `memberId`: Reference to `Member`.
- `channel`: `'SMS' | 'WHATSAPP' | 'EMAIL'`.
- `recipient`: Phone number or email address.
- `eventType`: `'PAYMENT_CONFIRMATION' | 'MONTHLY_REMINDER' | 'PENALTY_NOTICE' | 'ANNUAL_STATEMENT'`.
- `templateKey`: Identifier of the template used.
- `renderedMessage`: Final message text sent.
- `status`: `'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED'`.
- `providerResponse`: External transaction ID, status code, or error description.
- `sentAt`: Timestamp of delivery attempt.

### 2. Notification Service & Adapters (`backend/src/services/notification/`)
- `types.ts`: Interface defining `NotificationProvider`, `NotificationPayload`, `DeliveryResult`.
- `providers/sms-greenweb.provider.ts`: HTTP API integration with Greenweb / SSL Wireless using API token.
- `providers/email-smtp.provider.ts`: Nodemailer transport for sending receipt summaries.
- `providers/mock-notification.provider.ts`: Logs notifications to the terminal during local development without spending SMS credits.
- `notification.service.ts`:
  - Compiles templates with variables (`{{memberName}}`, `{{amount}}`, `{{month}}`, `{{totalDue}}`, `{{receiptUrl}}`).
  - Ensures non-blocking execution: wrapped in try/catch or dispatched via Issue #21 background job worker.
  - Persists entry to `NotificationLog`.

### 3. Integration Points
- **Payment Recording (`PaymentService.ts`):** After payment transaction commits successfully, trigger `notificationService.sendPaymentConfirmation(...)`.
- **Scheduled Reminders (Background Cron / Scheduler):**
  - Query all active members with outstanding obligations for the current month.
  - Dispatch reminder messages on the 10th and 14th of the month.
  - Dispatch penalty notification on the 16th of the month for members who incurred a late fee.

### 4. Admin Settings & Template Configuration UI
- Add a "Notification Settings" panel to `SettingsPage.tsx`:
  - Toggle switches: Enable/Disable SMS, Enable/Disable Email.
  - Credentials configuration: SMS API token, Sender ID, SMTP host/port/user/pass (masked).
  - Template Editor: Editable templates for English and Bangla.
- Add a "Notification History" tab to `AuditPage.tsx` or `SettingsPage.tsx` showing the delivery log with search and status badges.

---

## Acceptance Criteria

- When a payment is recorded by an accountant, the member receives an automated SMS/Email within 10 seconds.
- An external SMS gateway outage or timeout never blocks or rolls back the underlying financial payment transaction.
- All sent notifications are tracked in `NotificationLog` with timestamp, channel, and provider response.
- Admins can customize message templates and test gateway connectivity directly from the Settings page.
