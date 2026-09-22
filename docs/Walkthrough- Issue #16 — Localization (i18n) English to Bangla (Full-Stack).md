# Walkthrough — Issue #16: Localization (i18n) English to Bangla

## Delivered

Issue #16 adds an English/Bangla localization foundation, improves Member List usability, and changes gateway-fee rounding so administrators can use exact charges.

## Localization

1. Open **Language & Appearance** from the sidebar Settings entry to select English or Bangla.
2. The chosen language is saved in the browser and is restored on the next visit. On the first visit, Bangla is selected automatically when the device language is Bangla.
3. Shared navigation, module titles, common buttons, statuses, form labels, payment and settings labels, accessibility labels, and other static UI copy are translated through the central resource using simple Bangla terms.
4. The application document language changes to `bn` for Bangla and uses a Bangla-friendly font fallback.
5. The localization context exposes locale-aware amount, number, and date formatters for all new and migrated UI. Currency displays use `BDT` before the amount in English and `টাকা` in Bangla.
6. User-entered names, member/receipt IDs, account names, and immutable audit records remain unchanged to preserve their authoritative meaning.

## Member List

1. The list retains the original SL No sequence.
2. The original column order is retained: SL No, Member ID, Full Name, Contact Info, Shares, Monthly Payable, Status, Join Date, and Actions.
3. The Actions column is sticky on wide tables so View, Edit, and Drop remain available while reading horizontally.
4. The table remains horizontally scrollable on small screens; no data columns, rows, or action controls are hidden or moved into cards.

## Gateway Cash-out Rules

1. Administrators can open **Organization Settings → Gateway Cash-out Rules**.
2. `Round charge up to (BDT)` now accepts `0`.
3. A value of `0` means **no rounding**. For example, a 1.85% charge on BDT 1,000 remains BDT 18.50.
4. Any positive value still rounds upward. For example, `10` turns BDT 18.50 into BDT 20.
5. The active bKash and Nagad rules are synchronized with rounding set to `0`; Bank and Cash remain zero-fee with no rounding.
6. Fee calculations use fixed two-decimal currency precision, preventing floating-point values such as BDT 18.500000000000004.

## Security and Validation

- Gateway changes remain restricted to administrators and retain audit logging.
- Payment calculations remain server authoritative.
- Backend build passes.
- Frontend production build passes.
- The Settings/member and dashboard/report integration tests are ready to run; they require MongoDB to be available on `127.0.0.1:27017`.
