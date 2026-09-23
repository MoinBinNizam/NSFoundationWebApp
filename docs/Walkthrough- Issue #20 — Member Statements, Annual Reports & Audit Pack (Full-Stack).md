# Walkthrough — Issue #20: Member Statements, Annual Reports & Audit Pack

## Delivered

Issue #20 adds a controlled export workspace for member statements, annual reports, and Super Admin audit packs.

## Member statements

1. Open **Statements & Reports** from the sidebar.
2. Enter a member's database ID and select **Download PDF**.
3. The server generates the statement from authoritative member, share-history, monthly-ledger, payment, and payment-allocation records.
4. Statements show member identity, share history, monthly obligations, paid amounts, current dues, advances, cash-out due, payment receipts, and allocation record count.
5. Only authorized staff can download statements.

## Annual reports

1. Enter an accounting year and download the annual report.
2. A locked AnnualClosing report is used when available.
3. If no locked closing exists, only Super Admin can obtain a clearly marked provisional report.
4. The report contains annual collections, principal, penalties, cash-out charges, expenses, investment returns, profit/loss, dues, advances, custody balance, and member totals.

## Audit pack

1. Super Admin can download an annual audit pack for the selected year.
2. The pack includes immutable audit events and policy-version references.
3. It is limited to Super Admin because it can contain sensitive governance history.

## Integrity and security

- PDFs are generated on the server after authorization; the browser does not assemble or alter financial totals.
- The pending post-2024 transferred-share accumulated-entitlement rule is explicitly excluded from every document.
- Financial source records remain unchanged by report generation.

## Verification

- Backend TypeScript production build passed.
- Frontend TypeScript check passed.
- A live member-statement PDF was generated, rendered, and visually checked for readable layout and complete sections.
