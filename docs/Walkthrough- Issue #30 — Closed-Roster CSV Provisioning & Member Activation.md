# Walkthrough — Issue #30: Closed-Roster CSV Provisioning & Member Activation

## Administrator import

Open **Member Management** and click **Import CSV**.

1. Choose the approved 2024 CSV file.
2. Click **Preview and validate**. Review each Member ID, name, normalized mobile number, and any validation warning.
3. Enter a temporary activation password with at least 12 characters and click **Confirm and save to database**.

The preview expires in 15 minutes. The CSV is not persisted after the confirmed import, so it may be deleted from the administrator's computer after success.

## Member activation

Members sign in using the imported mobile number and temporary password. The system displays the authenticated Member name only and sends them to `/change-password`. All member portal and financial APIs are blocked until a new 12-character password is set. After activation, the Member is redirected to their linked `/member-portal` profile.

## Operational limits

Public registration is closed. Password recovery delivery requires a verified channel. Production SMS OTP has gateway/carrier cost; it cannot be implemented at zero cost. Email links can have no additional per-message cost only when NS Foundation already operates SMTP infrastructure.

## Verification

```powershell
npm run typecheck --prefix backend
npx tsc -b --pretty false --prefix frontend
```

The frontend TypeScript check passed. The backend TypeScript and Vite bundle checks are currently blocked by a pre-existing local Node process consuming approximately 2.7 GB of memory; rerun them after that process completes.
