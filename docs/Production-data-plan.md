Yes—but the two existing modules have different roles, and the current system needs one controlled extension before it can safely post these historical payment sheets into production.

## What the current modules can do

| Module | Use in production | Current limitation |
|---|---|---|
| Member Management → Import | Yes, for the initial membership registry | Accepts CSV only and creates Member, User login, and initial Share History |
| Historical Migration & Reconciliation | Yes, for staging, reviewing, and reconciling historical sources | It currently stages CSV rows only; it does **not** post staged payments, allocations, custody movements, or advances into live financial records |
| Contributions & Payments | Yes, for daily manual and OCR-assisted receipt entry | Must not be used to manually recreate all historical rows |

So the correct answer is: use Member Import for the roster, use Historical Migration for source staging/review, then add an approved **Historical Payment Posting** step that creates the actual audited payment records only after reconciliation approval.

## Production data plan

### 1. Prepare a separate staging environment

Do not import directly from your current local database into production first.

Create:

- Local development database: your current workspace/testing data
- Staging MongoDB database: migration rehearsal and verification
- Production MongoDB database: real member and financial records only

The same Docker images can run in staging and production, but each environment must have its own MongoDB database, secrets, and backups.

### 2. Prepare the source archive

Keep the original `.xlsx` sheets and receipt images privately. Do not commit them to GitHub.

For each month, create a normalized import manifest containing:

- source workbook and sheet name
- source row number
- Member ID
- payment date
- amount received
- principal paid
- paid penalty
- due principal
- due penalty
- due cash-out charge
- advance/balance
- gateway and receiver
- comment
- color-derived payment status
- unique source reference/hash

The original spreadsheet remains evidence. The normalized manifest is what the Historical Migration module stages and reviews.

### 3. Import the Member Management registry first

Use the existing Member Management Import option in the new production database.

The roster CSV must contain:

```text
memberId,name,phone,joinDate,shares,status
```

That import will:

- create each Member record
- create a member login account
- create initial Share History
- assign a temporary password requiring change on first sign-in

Members do not need to self-register.

For Moin and Samrat:

1. Import them as members first, using their real member IDs.
2. Provision or upgrade their existing user accounts as Accountant / Assistant Accountant.
3. Create and verify their Bank, bKash, Nagad, and Cash custody accounts.
4. Ensure the same person has one linked user/member identity, not separate duplicate accounts.

If self-registration should never be available in production, the public registration route and UI should be disabled before launch. This is a separate production-access policy change.

### 4. Establish the December 2024 share reconciliation baseline

December 2024 is the closing reconciliation point.

Before posting January 2025 payments:

- verify every active member’s December closing share count
- record approved December advances and balances
- record share adjustments with effective dates
- reconcile the final share position against the December source sheet

Historical payments before December must retain their month-specific share count from the source sheet. The importer must not apply a member’s later December share adjustment to an earlier month.

### 5. Stage January 2024–April 2025 payment data

Use Historical Migration & Reconciliation to stage normalized monthly CSV manifests.

For each batch:

1. Upload CSV into the module.
2. Review matched members, gateway normalization, receiver mapping, and comments.
3. Mark unclear rows as unresolved.
4. Compare monthly totals, dues, penalties, advances, and custody totals.
5. Approve only when every material exception is resolved.

No posting occurs at this stage.

### 6. Post approved historical payments

After a batch is approved, the new historical posting action should create:

- Payment receipt
- Payment allocation
- approved principal/penalty settlement
- historical due snapshot
- advance credit/balance
- custody movement
- migration reference and audit log

Historical rules:

- January 2024–April 2025 use **Exclude gateway cash-out charge** by default.
- Existing cash-out dues stated in source comments are retained as dues.
- No new cash-out charge is inferred from historical payment amounts.
- `Self` maps to `Cash`, received into Moin’s or Samrat’s own cash custody account.
- All bKash spelling variants normalize to `bKash`.
- All Nagad spelling variants normalize to `Nagad`.
- Duplicate prevention uses the source reference, member, date, amount, gateway, and transaction ID where available.

### 7. Handle May–September 2025 receipt images

Use the OCR queue for these receipts.

OCR should extract:

- amount
- payment date/time
- gateway/channel
- transaction ID/reference
- destination account/accountant

The accountant must select the member and confirm allocation before saving. Receipt images alone cannot safely identify the member in every case.

These entries remain historical, but are entered through an OCR-assisted payment workflow with a migration source label.

### 8. Import investment records separately

Do not mix investment sheets with member payment batches.

After member, share, and custody setup is reconciled:

1. Stage investment sheets as separate historical migration batches.
2. Map project, funding source, investment amount, return/profit, date, and supporting notes.
3. Reconcile every investment funding/return against custody movements.
4. Post only approved investment batches.

### 9. Allow manual payments during the migration

Manual entry can remain available, with strict period separation:

```text
Jan 2024 – Apr 2025      Historical spreadsheet import
May 2025 – Sep 2025      OCR-assisted historical receipt entry
After approved cutover   Normal live manual/OCR payment entry
```

Do not manually enter a receipt in a month currently being imported unless it is explicitly marked as a historical correction and passes duplicate checks.

For the live launch window, keep payment entry restricted until the approved historical baseline is posted and reconciled. After that, accountants can use normal manual payment and OCR entry immediately.

## What happens at production deployment

You will not manually re-enter all data.

Production deployment moves code and containers, but the approved data migration is a separate controlled operation:

```text
Deploy application to staging
→ import and reconcile staging data
→ approve results
→ backup production database
→ deploy application to production
→ import the same approved manifests into production
→ verify reports, custody, shares, and audit log
→ enable member/staff login and live operations
```

Once imported into production MongoDB, member accounts, shares, payments, dues, investments, custody data, and audit logs remain there permanently. Future code deployments do not erase them, provided production uses persistent MongoDB storage and backups.

## Responsibility continuity plan

Financial responsibility belongs to a current **person and custody account**, not to a hard-coded name. An Accountant or Assistant Accountant can resign, be removed, or be replaced without altering any past payment, transfer, expense, audit event, or receipt.

### Controlled handover procedure

1. Record the board decision and the handover reason.
2. Create the successor's user/member identity first, or select their existing active member identity.
3. Create and verify the successor's custody accounts for every payment gateway they will receive.
4. In the Custody Ledger, transfer every outgoing custody balance to an approved destination or reconcile it to zero. Do not delete, overwrite, or reassign the former accounts.
5. In Settings → Accountant responsibilities, select **Handover**; choose the successor, their custody accounts, permitted gateways, and the board-approved reason.
6. The application verifies that every former custody account has a derived balance of ৳0, deactivates those accounts, invalidates the former operational gateway key and sessions, and creates a new one-time key for the successor.
7. Verify the successor can collect a test payment only into their own active custody account; verify that the former staff member can no longer create operational transactions.

Historical records retain their original receiver, custody account, payment, transfer, and audit identifiers. Corrections must be new audited reversals or adjustment records; they must never rewrite historical ownership.

### Vacant role and offboarding rules

- Use **Appoint member** only when the responsibility is vacant. It promotes an existing active member without creating a duplicate person or member number.
- Use **Provision new staff** only when the successor is not already in the membership registry.
- A staff member linked to a member remains an active ordinary member after leaving financial responsibility; a non-member staff identity is suspended.
- Direct revocation is blocked while any active custody account has a non-zero derived balance.
- All appointment, handover, revocation, and gateway-key changes create immutable audit events.

## Current historical evidence inventory

`docs/import-historical-evidence/` now contains the supplied January–December 2024 payment sheets, January–April 2025 sheets, December 2024 reconciliation material, investment workbook, and sample Bank/bKash receipts. These are private source evidence and must remain outside Git commits, Docker images, and production web storage.

The remaining work is verification and normalized manifest preparation—not automatic posting. For each workbook/month, reconcile member ID, share position, received amount, paid/due principal, paid/due penalty, cash-out status, advance balance, gateway, receiver, source comment, and receipt/reference before obtaining approval to post.

## Next step

Review the complete evidence set in a staging database, create approved month-by-month manifests, and obtain a signed reconciliation result before posting any historical payment or investment records. Only then run the approved migration into production, verify the financial reports and custody balances, and open live operations.
