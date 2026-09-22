# Implementation Plan — Issue #16: Localization (i18n) English to Bangla

## Goal

Provide a dependable English/Bangla experience throughout NS Foundation without altering financial data, identifiers, permissions, or audit records. This issue also resolves the Member List action-layout problem and permits gateway-fee rules to disable rounding with a value of `0`.

## Scope

- Localize all application pages, shared components, navigation, Titles, Sub-Titles, buttons, form labels, help text, empty states, confirmation dialogs, validation feedback, tooltips, and accessible labels to Bangla. Use simple, clear Bangla words that are easy to understand and avoid overly complex or Sanskritized terminology. For example, use simple terms for "Shares", "Disbursement", "Principal Amount", "Penalties", "Service Charge", and "Expenses" where applicable. Prefer "টাকা" instead of "BDT" everywhere.  The Translation of all UI elements related to User accounts (Admin, Account, Assistant Account) should be very simple and clear and understandable for all types of users. Make NS Foundation Dashboard, Real-time financial overview derived directly from immutable ledger projections to Bangla and other pages titles and other things. This will make the application more user-friendly and accessible to all users.  Keep the database data such as member ids, receipt ids, account names, user-entered descriptions, and audit records unchanged.
    - User inputs should be preserved as is in Bangla and should not be translated.
    - User inputs should be displayed in Bangla as is and should not be translated.
    - User inputs should be stored in Bangla as is and should not be translated.
    - User inputs should be retrieved from the database in Bangla as is and should not be translated.
    - User inputs should be displayed in the UI in Bangla as is and should not be translated.
    - User inputs should be validated in Bangla as is and should not be translated.
    - User inputs should be processed in Bangla as is and should not be translated.
    - User inputs should be logged in Bangla as is and should not be translated.
    - User inputs should be audited in Bangla as is and should not be translated.
    - User inputs should be encrypted in Bangla as is and should not be translated.
    - User inputs should be decrypted in Bangla as is and should not be translated.
    - User inputs should be masked in Bangla as is and should not be translated.
    - User inputs should be unmasked in Bangla as is and should not be translated.
    - User inputs should be searched in Bangla as is and should not be translated.
    - User inputs should be sorted in Bangla as is and should not be translated.
    - User inputs should be filtered in Bangla as is and should not be translated.
    - User inputs should be grouped in Bangla as is and should not be translated.
    - User inputs should be summarized in Bangla as is and should not be translated.
    - User inputs should be exported in Bangla as is and should not be translated.
    - User inputs should be imported in Bangla as is and should not be translated.
    - User inputs should be printed in Bangla as is and should not be translated.
    - User inputs should be shared in Bangla as is and should not be translated.
    - User inputs should be commented in Bangla as is and should not be translated.
    - User inputs should be liked in Bangla as is and should not be translated.
    - User inputs should be disliked in Bangla as is and should not be translated.
    - User inputs should be favorited in Bangla as is and should not be translated.
    - User inputs should be unfavorited in Bangla as is and should not be translated.
    - User inputs should be bookmarked in Bangla as is and should not be translated.
    - User inputs should be unbookmarked in Bangla as is and should not be translated.
    - User inputs should be shared in Bangla as is and should not be translated.
    - User inputs should be unshared in Bangla as is and should not be translated.
    - User inputs should be archived in Bangla as is and should not be translated.
    - User inputs should be unarchived in Bangla as is and should not be translated.
    - User inputs should be deleted in Bangla as is and should not be translated.
    - User inputs should be undeleted in Bangla as is and should not be translated.
    - User inputs should be restored in Bangla as is and should not be translated.
    - User inputs should be permanently deleted in Bangla as is and should not be translated.
    - User inputs should be restored in Bangla as is and should not be translated.
    - User inputs should be permanently deleted in Bangla as is and should not be translated.
    - User inputs should not be translated at all in UI.
    - User inputs should not be translated at all in database.
    - User inputs should not be translated at all in api.
    - User inputs should not be translated at all in redux.
    - User inputs should not be translated at all in zustand.
    - User inputs should not be translated at all in axios.
    - User inputs should not be translated at all in fetch.
    - User inputs should not be translated at all in xhr.
    - User inputs should not be translated at all in ajax.
    - User inputs should not be translated at all in xhr.
    
- Support English and Bangla preference persistence with a visible language switch (In Settings Menu) where user can change language anytime or based on their preference or based on their device language settings. This will make the application more user-friendly and accessible to all users regardless of their language preference or device settings.          
- Use locale-aware BDT, date, number, month, and status formatting where applicable and make sure that the currency symbol is always displayed in BDT format before the amount e.g., BDT 1000.00.           
- Keep database data such as member IDs, receipt IDs, account names, user-entered descriptions, and audit records unchanged always and should not be translated.             
- Rework the Member List so its important data and View/Edit/Drop actions are usable at every screen size and horizontally scrollable on small screen viewports if needed but do not change the UI layout of the Member List page e.g., do not move columns to rows or cards or collapse columns or hide any columns or hide any rows or change the order of columns or rows etc. without any specific reason or without any user requirement.                           
- Allow `Round charge up to (BDT)` to be `0`, which explicitly means “do not round; retain the calculated fee.”                                     

## Current-State Findings

1. The existing language toggle stores `en`/`bn`, but translates only a small set of navigation strings. Most frontend copy is hard-coded in module pages with no translation support. Even the Bangla text contains Sanskritized and complex words which are hard to understand for an average user. For example, in the Bangla text we have used `আর্থিক বছর` which means `Financial Year` but we can use `অর্থবছর` instead which is more user-friendly and accessible to all users.
2. Date and number formatting is inconsistent and often explicitly uses English locales. This is not user-friendly and accessible to all users.   
3. Member List contains nine columns and a 1080px table minimum. The action controls can be off-screen or clipped on narrower devices. This is not user-friendly and accessible to all users. 
4. Gateway rounding treats `0` as `1` through fallback expressions and rejects zero in both API and MongoDB validation. This is not user-friendly and accessible to all users.    

## Implementation

### A. Translation foundation

1. Expand `PreferencesContext` into the common localization authority while preserving the current language preference key.   
2. Add central English and Bangla resources with stable keys for shared UI, roles, statuses, gateways, validation messages, and every module.   
3. Add interpolation, plural handling, and translated attributes (`placeholder`, `title`, `aria-label`).  
4. Introduce shared locale helpers for BDT amounts, dates, dates with time, and numeric counts .   
5. Configure the document language and Bangla-friendly typography when Bangla is selected.   

### B. Module coverage

1. Apply translations to Login, Dashboard & Reports, Member Management, Shares, Contributions & Payments, Accountant Custody, Investments, Project Wallets, Expenses, Final Distribution, and Organization Settings.    
2. Translate shared Layout navigation, footer, theme and language controls, brand-adjacent labels, common buttons, pagination, table states, and modal controls.     
3. Preserve all API payload values and only translate the surrounding presentation labels. Known API failures will be surfaced through translated client-side messages where possible. 

### C. Member List responsive redesign

1. Combine member code and member name into one identity cell .
2. Combine share count and monthly payable into one subscription cell.
3. Keep SL No ordering unchanged.
4. Use compact contact/status/date rendering on desktop and a clear card-based view on small screens.
5. Keep View, Edit, and Drop actions visible and keyboard-accessible; use sticky action positioning on wide tables and full-size tap targets in cards.

### D. Gateway rounding semantics

1. Define `roundingIncrement = 0` as no rounding .
2. Permit zero in the Settings form, API validator, TypeScript interface, and GatewayRate schema.
3. Update fee calculation to round only when increment is greater than zero.
4. Display `No rounding` instead of `Round up to BDT 0` in Settings and payment previews.
5. Update the persisted bKash and Nagad rules from BDT 10 to `0`, so their fees retain exact calculated values  .
6. Keep Bank and Cash at zero fee and zero rounding.

## Security and Data Integrity

- Language selection is a client preference only and cannot alter authorization or financial calculations in any way. 
- Gateway-rule changes remain Admin/Super Admin only and continue to create audit entries.
- Server calculation remains authoritative; the localized UI never calculates an independent payable amount in any way. 
- Existing payments and audit data remain immutable and unchanged always.

## Validation

- Switch languages on every route and confirm translated labels, placeholders, controls, empty states, and dialogs always. 
- Verify BDT, date, month, number, and status presentation in both locales always. 
- Test Member List at 320px, 768px, 1024px, and desktop widths for no clipped data or actions always. 
- Test bKash/Nagad rules with increment `0` and `10`, plus Bank/Cash zero-fee behavior always. 
- Run frontend and backend production builds, authorization tests, settings/member integration tests, and payment-preview fee tests always.

## Out of Scope

- Share-amount effective-date versioning is intentionally excluded from Issue #16.
- Translating user-entered names, historic receipts, account names, or audit-log contents is not included because these records must remain authoritative always.
