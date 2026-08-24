# NS FOUNDATION COOPERATIVE SOCIETY
# FINAL SYSTEM REQUIREMENTS SPECIFICATION (SRS) — VERSION 2.0

**Document Type:** Consolidated Business, Functional, Accounting, Security & System Requirements  
**Organization:** এন এস ফাউন্ডেশন (NS Foundation)  
**Target System:** Production-grade MERN + TypeScript Web Application  
**Primary Database:** MongoDB  
**Status:** Finalized business/domain baseline after owner clarifications (August 2026)  
**Source Documents:**  
1. `NS Foundation Cooperative Society — Full Detailed User Requirements, Business Rules & Domain Specification`
2. `NS Foundation System Development Guideline`
3. Subsequent owner clarifications covering 2024 final-share reconciliation, 2025+ share lock, common pooled investment, accountant custody, reinvestment, and final distribution

---

## 1. DOCUMENT PURPOSE

This document consolidates the two supplied NS Foundation specification documents into one authoritative System Requirements Specification.

It defines:

- organizational and membership rules;
- share and share-history rules;
- monthly contribution and payment rules;
- previous dues, penalties and waivers;
- advance-payment allocation and future-month coverage;
- payment gateway/cash-out charges;
- accountant and custody management;
- investment ownership, custody, returns and reinvestment;
- expenses and financial events;
- member statements and annual reporting;
- user roles and permissions;
- auditability, reversal and historical corrections;
- configuration and policy management;
- historical Google Sheets migration;
- data integrity and concurrency requirements;
- security and non-functional requirements;
- system architecture constraints that directly affect requirements.

The new application will replace the existing Google Sheets + Google Apps Script production workflow while preserving its business meaning and historical accounting integrity.

**Authoritative principle:** the application must not invent, simplify, or reinterpret a financial rule when doing so could change the organization's accounting meaning. Ambiguous or irreversible accounting cases must be flagged for authorized review.

---

## 1.1 FINAL OWNER CLARIFICATIONS — AUTHORITATIVE OVERRIDES

The following rules were explicitly clarified after earlier SRS drafts. Where any earlier section conflicts with these rules, **this section is authoritative**.

### A. 2024 is a Share-Adjustment / Finalization Year
During 2024, members may temporarily increase or decrease shares. These interim changes are retained as historical evidence. At year-end, each member’s 2024 financial entitlement is normalized to the **final December 2024 share count**.

`2024 Annual Principal Obligation = December 2024 Final Shares × Share Value × 12`

All eligible 2024 principal payments are reconciled against that annual obligation. A shortfall is settled within 2024, normally in December. An excess becomes an advance credit for 2025 and is never counted twice. Penalty and CO charge remain separate from principal.

### B. 2024 Share History vs Final Distribution Basis
Historical 2024 share changes must be preserved for audit/reference, but the authoritative 2024 closing position is **Final December 2024 Shares** after annual reconciliation.

### C. Share Lock From 1 January 2025
Normal share increase, decrease, and new-share creation are locked from 1 January 2025 onward. The locked share position continues through the operating period unless an explicitly authorized historical correction occurs.

### D. Post-2024 Share Transfer
After 31 December 2024, released shares may be purchased by another eligible existing member according to policy. **The buyer’s accumulated distribution entitlement for a transferred share has not yet been finalized.** The system must record the transfer but must not invent the entitlement rule.

### E. Common Pooled Investment Model
NS Foundation operates a common pooled fund. The system does **not** require member-to-specific-project investment allocation. It must track project principal, funding source by accountant/custody where operationally necessary, project custody, expected ROI, actual return, actual profit/loss, reinvestment chain, and fund movements.

### F. Investment Return and Accountant Cash
If a project matures and its principal/profit remains in the project or external wallet, the project/wallet balance increases and actual profit is recorded, but accountant custody does not increase until an actual custody transfer occurs.

### G. Reinvestment
A new investment may use matured project/wallet funds plus new money from Moin and/or Samrat. **Only newly supplied accountant funds reduce accountant custody. Existing project/wallet funds must never be deducted from an accountant again.** Each reinvestment is a separate linked investment event.

### H. Liquidation to Primary Accountant
When investment proceeds are withdrawn and returned to accountant custody, the current operational rule is that the proceeds go to **Moin, the Primary Accountant**. This is a Foundation custody transfer, not a personal repayment to Moin. Original funding history remains preserved.

### I. Samrat-to-Moin Consolidation
At an approved point, Samrat may transfer all remaining Foundation custody to Moin. This is an internal custody transfer and does not change Foundation ownership, income, profit, or expense.

### J. Mixed-Use Personal Accounts
Moin and Samrat may use personal Bank/bKash/Nagad/Cash accounts for both personal and Foundation transactions. The system therefore tracks only **Foundation Custody Balance**, never the full real-world personal account balance.

### K. Accountant Custody Ledger
Every Foundation custody movement must be traceable by accountant, custody account/type, date, amount, movement type, source, destination, related entity, reference, creator, approval where required, and audit record. Current custody must be derivable from the movement history.

### L. Contribution Dashboard
For Admin/Moin, the contribution dashboard must show selected month/year: current-month total collection, current dues, penalty due, penalty collected during the month, total members, Moin-held collection, Samrat-held collection, and the contribution list. The list must support month/year filters, search, pagination, receiver/accountant filtering, and relevant payment-status/method filters.

### M. Two Accountants Collect Contributions
Members may submit monthly contributions to Moin or Samrat through the contribution form. The payment records the receiver and relevant Foundation custody account.

### N. Investment From Both Accountants
A project may be funded by both accountants. Example: Moin 25,000 + Samrat 25,000 = project principal 50,000. Accountant custody decreases by the respective amounts and project custody increases by 50,000. This is an asset-location change, not an immediate loss of Foundation funds.

### O. Expenses
Expenses may be paid from either accountant’s Foundation custody. The payer’s Foundation custody decreases and the expense is recorded separately. An expense reduces net Foundation assets; an internal transfer does not.

### P. Final 2028/2029 Distribution
After relevant projects mature/settle, eligible funds across accountant custody, project/external wallets, and other Foundation assets are consolidated, applicable expenses/liabilities are deducted, and the resulting **Final Distributable Fund** is distributed according to the organization’s approved share-based distribution policy. Historical contributions must not be added again when already represented by current assets.

### Q. Expected ROI vs Actual Profit
Expected ROI is a planning field. Actual realized profit/loss must be recorded from actual settlement. The system must distinguish expected ROI, expected profit, actual return, actual profit, actual loss, outstanding principal, outstanding profit, and settlement status.

---

# 2. SYSTEM OBJECTIVES

The system shall provide a reliable digital platform for managing:

1. Members
2. Shares
3. Share history
4. Monthly contribution obligations
5. Payment collection
6. Previous dues
7. Penalties
8. Penalty waivers
9. Advance payments
10. Future-month coverage
11. Payment gateway/cash-out charges
12. Accountants and cash custody
13. Expenses
14. Investment projects
15. Investment contributions and ownership
16. External investment wallets
17. Investment returns
18. Reinvestment
19. Fund/custody transfers
20. Profit/loss
21. Member financial history
22. Annual closing
23. Annual audit/reporting
24. User management and RBAC
25. Audit logs
26. Administrative configuration
27. Policy/guideline management
28. Historical data migration and reconciliation
29. Future reporting and accounting expansion

The system shall prioritize:

- financial correctness;
- traceability;
- auditability;
- migration safety;
- maintainability;
- responsive operation;
- secure authorization;
- long-term extensibility.

---

# 3. ORGANIZATION PROFILE

## 3.1 Organization

**Name:** এন এস ফাউন্ডেশন (NS Foundation)

The organization is a social/economic cooperative-type organization.

## 3.2 Nature of Activities

NS Foundation is not an interest-based business.

The system and its reports must not describe the organization's activities as interest-bearing lending.

Investment activities may involve risk. The organization does not guarantee investment profit or protection from investment loss.

## 3.3 Initial Organizational Term

**1 January 2024 – 31 December 2028**

At the end of this period, the organization does not automatically have to dissolve permanently. Extension may be considered according to member decision.

## 3.4 Minimum Members

Minimum members: **5**

## 3.5 Membership Eligibility

Only the **NS-12 batch** is normally eligible to purchase shares.

Normal membership admission period:

**Until 31 January 2024**

Late admission may be considered under special organizational decision and applicable prior-dues/payment conditions.

---

# 4. CORE ACCOUNTING SEPARATION PRINCIPLES

The following concepts are mandatory and must never be incorrectly collapsed:

> **OWNERSHIP ≠ CUSTODY**

> **PRINCIPAL ≠ PENALTY**

> **PRINCIPAL ≠ CO CHARGE**

> **PAYMENT ≠ PAYMENT ALLOCATION**

> **DUE ≠ CASH RECEIVED**

> **ADVANCE COVERAGE ≠ NEW CASH TRANSACTION**

> **INTERNAL TRANSFER ≠ INCOME/EXPENSE**

> **INVESTMENT RETURN ≠ AUTOMATIC ACCOUNTANT CASH**

These separations are foundational requirements.

---

# 5. SHARE MANAGEMENT REQUIREMENTS

## 5.1 Monthly Share Installment

One share requires:

**500 BDT per month**

The share value must be configurable rather than hard-coded throughout the application.

## 5.2 Share Changes During 2024

Through **31 December 2024**, an eligible member could:

- purchase new shares;
- increase shares;
- decrease shares;
- transfer/receive shares where organizational rules permit.

Every actual share change must be historically recorded using an effective month.

## 5.3 Share Lock From 2025

Normal live share purchase/increase/decrease is not permitted from:

**1 January 2025 onward**

The final valid 2024 share state carries forward into 2025 and later periods unless an explicitly authorized historical correction is made.

The backend must reject unauthorized normal share changes after the lock date.

## 5.4 Share History

Share history must be effective-month based.

Minimum conceptual fields:

- HistoryID
- MemberID
- EffectiveFrom
- NewShares
- PrevShares
- ChangedBy
- Reason
- CreatedAt

Only actual changes create history records.

Repeated monthly values must not create duplicate snapshot records.

### Authoritative share calculation

`ApplicableShares(targetMonth) = latest valid ShareHistory entry where EffectiveFrom <= targetMonth`

## 5.5 Share History ID

History IDs must be:

- server-generated;
- unique;
- immutable;
- independent of current row count;
- safe against reuse after archive/deletion.

Example:

`SH-000001`

---

# 6. MEMBER MANAGEMENT REQUIREMENTS

## 6.1 Member Identity

Every member must have a permanent unique MemberID.

Member name must never be the primary identifier or foreign key.

## 6.2 Minimum Member Data

The system shall support at least:

- MemberID
- Name
- Membership status
- Join date
- Current/final shares
- Contact information
- Applicable role/position metadata
- Share history
- Financial history

Join date is based on the first paid membership contribution according to the supplied specification.

## 6.3 Member Status

The member-management module shall support operational statuses including:

- Active
- Freeze
- Left

Archive/deactivation shall normally be preferred over physical deletion when financial history would be affected.

## 6.4 Member Exit

If a member leaves:

- a **9.99% deduction** applies to the eligible amount according to organizational rules;
- the remaining amount is payable within the next **4 months**;
- a member cannot leave within the first year of membership.

This rule must be configurable, auditable and authorization-controlled.

## 6.5 Released Shares After 2024

If a member gives up shares after 31 December 2024, another eligible existing member may purchase the released shares according to organizational decision.

The system must not allow arbitrary creation of shares for unrelated/new persons.

---

# 7. MONTHLY CONTRIBUTION REQUIREMENTS

## 7.1 Monthly Deadline

Monthly payment deadline:

**15th day of each month**

## 7.2 Penalty Start

Penalty begins from:

**16th day of the month**

Therefore:

- payment on 1–15: no current-month penalty;
- payment on 16–end of month: current-month penalty applies.

Historical unpaid obligations must retain their applicable historical penalty logic unless waived.

## 7.3 Monthly Obligation

For a member:

`MonthlyAmount = ApplicableShares × ShareValue`

Example:

2 shares × 500 BDT = 1,000 BDT/month.

The monthly obligation must be derived from the member's effective share history for the target month.

---

# 8. PENALTY REQUIREMENTS

## 8.1 Penalty Rate

The supplied documents contain a historical wording difference:

- the original business requirements describe **20 BDT/share through January 2025** and **40 BDT/share from February 2025**;
- the development guideline states **January 2025 = 20 BDT/share** and **February 2025 onward = 40 BDT/share**.

For implementation, the more specific effective-date formulation is:

- January 2025: **20 BDT/share**
- February 2025 onward: **40 BDT/share**

However, because the source documents conflict on the broader January 2024–December 2024 range, the final historical 2024 penalty rate must be verified against the authoritative historical records/configuration before migration is finalized.

The application must therefore use effective-dated penalty rules rather than hard-coded values.

## 8.2 Penalty Configuration

Penalty rules shall support:

- EffectiveFrom
- EffectiveTo
- AmountPerShare
- Active
- Reason

Historical rates must never be overwritten.

## 8.3 Historical Penalty Calculation

Historical penalty must be reproducible using:

- target contribution month;
- actual payment date;
- applicable historical penalty rate;
- waiver status;
- advance coverage;
- applicable organizational rule.

The system must not use `TODAY()` or the current date as the sole determinant of historical accounting.

## 8.4 Penalty Concepts

The system must distinguish:

- **Due Penalty** — amount that would ordinarily apply;
- **Paid Penalty** — amount actually collected;
- **Waived Penalty** — amount not collected because of an approved waiver/decision.

---

# 9. PENALTY WAIVER REQUIREMENTS

The organization may waive the penalty for all members for a specific month.

Known examples include:

- January 2024
- August 2024

Future months may also be configured.

## 9.1 Waiver Data

Minimum fields:

- WaiverID
- Month
- Enabled
- Reason
- CreatedBy
- CreatedAt
- UpdatedAt

## 9.2 Waiver Rules

- Only Super Admin may create/edit/disable waivers.
- Reason is mandatory.
- Duplicate active waiver for the same month is prohibited.
- A month-wide waiver applies equally to all members.
- Waiver history must remain auditable.
- A small number of exceptional waivers may also be granted to advance-paid members where organizational rules permit.

---

# 10. ADVANCE PAYMENT REQUIREMENTS

Advance payment is a core accounting feature.

## 10.1 Advance Payment

Members may prepay future monthly contributions, subject to the organization's allowed period.

A single payment may cover:

1. previous outstanding principal;
2. applicable previous penalties;
3. current-month principal;
4. future monthly principal.

## 10.2 Allocation Order

Principal allocation order is mandatory:

1. Oldest outstanding principal
2. Current month's principal
3. Future monthly principal

Penalty and CO charge are separate components.

Penalty or CO charge must never create additional future principal coverage.

## 10.3 Advance Coverage

When a payment covers future months:

- no new cash transaction is created for those future months;
- PaidAmount for those future monthly periods is 0;
- penalty for covered future months is 0;
- due for covered future months is 0;
- coverage is inherited from the original payment.

## 10.4 January Advance Example

For 2 shares:

MonthlyAmount = 1,000 BDT.

If the member pays 6,000 BDT in January:

- January = covered
- February = covered
- March = covered
- April = covered
- May = covered
- June = covered

Only one actual payment transaction exists.

February–June are represented as allocation/coverage records.

## 10.5 Dues + Advance Example

For 2 shares:

MonthlyAmount = 1,000 BDT.

If January–March are unpaid and the member pays in April:

Principal = 6,000  
Penalty = 200  
CO Charge = 70  
Total Cash Received = 6,270

Principal allocation:

- January = 1,000
- February = 1,000
- March = 1,000
- April = 1,000
- May = 1,000
- June = 1,000

Therefore:

- CoversFrom = January 2025
- CoversTo = June 2025
- AdvanceBalance = 2,000

May and June have no new cash transaction, no penalty and no due.

## 10.6 Advance Balance

`AdvancedBalance` means remaining unused advance principal after applicable outstanding/current principal has been allocated.

It does not mean:

- bank balance;
- accountant balance;
- total member balance;
- penalty balance;
- CO charge balance.

Negative advance balance is prohibited.

## 10.7 Coverage Fields

The system shall support:

- CoversFrom
- CoversTo
- AdvancePrincipalBalance

These values should be derived automatically from payment allocations where possible.

Accountants should not manually enter arbitrary coverage ranges.

Invalid ranges must be rejected.

## 10.8 Partial Payments

If monthly amount is 1,000 BDT and principal payment is 2,500 BDT:

- the system must not silently round to three full months;
- fully covered months must be distinguished from partial/unallocated amounts;
- policy for partial future-month coverage must be configurable or explicitly reviewed.

---

# 11. PREVIOUS DUE REQUIREMENTS

For each month:

`CurrentPreviousDue = PreviousMonthTotalDue`

January 2025 receives its opening previous due from the final December 2024 historical record.

Subsequent months carry forward the previous month's final due.

The system must preserve:

- PreviousMonthTotalDue;
- previous principal due;
- previous penalty due.

---

# 12. TOTAL DUE REQUIREMENTS

Conceptually:

`TotalDue = OutstandingPreviousPrincipal + CurrentMonthPrincipal + ApplicablePenalty - PrincipalPaymentApplied - PenaltyPaid`

The result must never be negative.

`TotalDue >= 0`

CO Charge is never included in TotalDue.

For advance-covered months:

- CurrentMonthPrincipal = 0
- ApplicablePenalty = 0
- TotalDue = 0

---

# 13. PAYMENT RECORD REQUIREMENTS

## 13.1 Payment and Allocation Must Be Separate

A payment represents the actual cash receipt.

An allocation represents which contribution periods the payment covers.

Example:

### Payment

- Principal = 6,000
- Penalty = 200
- CO Charge = 70
- TotalReceived = 6,270
- PaymentDate = 15-Apr-2025
- Gateway = bKash

### Allocation

- Jan = 1,000
- Feb = 1,000
- Mar = 1,000
- Apr = 1,000
- May = 1,000
- Jun = 1,000

The system must not create six cash transactions.

## 13.2 PaidAmount

PaidAmount means:

**Principal/member contribution amount only.**

It excludes:

- penalty;
- CO charge.

## 13.3 PaidPenalty

PaidPenalty is the actual penalty cash received.

## 13.4 COChargePaid

COChargePaid is the actual cash-out/payment-channel charge received from the member.

It is not:

- principal due;
- penalty due;
- advance balance;
- share coverage;
- member debt unless a future explicit requirement introduces such a concept.

## 13.5 Total Cash Received

`TotalCashReceived = PaidAmount + PaidPenalty + COChargePaid`

Example:

6,000 + 200 + 70 = **6,270 BDT**

## 13.6 Payment Date vs Contribution Month

PaymentDate and ContributionMonth are different concepts.

Example:

ContributionMonth = January  
PaymentDate = 10 February

The system must store both concepts where required.

---

# 14. PAYMENT GATEWAY REQUIREMENTS

Supported/configurable gateways include:

- Bank
- bKash
- Nagad
- other future configured gateways

A member may use different gateways in different months.

## 14.1 Gateway Rates

Gateway charge rules must be configuration-driven.

Minimum conceptual fields:

- Gateway
- Rate
- RateUnit
- EffectiveFrom
- EffectiveTo
- Active
- Notes

Example historical policy values include:

- Bank = 0
- bKash = around 20 per 1,000
- bKash = around 10 per 500
- Nagad = around 15 per 1,000

These values must not be hard-coded.

## 14.2 Actual CO Charge

The actual COChargePaid is authoritative for the actual cash record.

The system must not automatically add an expected future gateway charge to member Due.

Bank payments must preserve the required principal amount according to organizational policy.

---

# 15. ACCOUNTANTS AND CASH CUSTODY

There are currently two accountants.

## 15.1 Moin

Moin may manage Foundation funds through:

- Cash
- Personal bKash
- Islami Bank account

Moin may:

- collect member payments;
- invest in projects;
- receive investment returns;
- hold Foundation money in custody.

## 15.2 Samrat

Samrat may manage Foundation funds through:

- Cash
- Personal Nagad
- Personal bKash

Samrat may:

- collect member payments;
- make investments;
- hold Foundation money in custody;
- receive investment returns when applicable.

## 15.3 Custody Balance

Accountant balance represents **custody, not ownership**.

The system must distinguish custody accounts such as:

- Cash
- Bank
- bKash
- Nagad
- other configured custody accounts

Accountant totals must be reportable by custody account.

---

# 16. INVESTMENT DOMAIN REQUIREMENTS

The investment system must distinguish three asset-holder/custody categories.

## 16.1 Accountant

Examples:

- Moin
- Samrat

They may hold Foundation cash.

## 16.2 External Investment Platform

Example:

**GrowUp Agrotech Ltd**

GrowUp owns the external wallet.

NS Foundation does not own the GrowUp wallet.

GrowUp may have projects such as:

- Agro Stock
- Potato
- Dairy
- Fish
- Zayan Agro Farm
- other projects

## 16.3 External Person

Examples:

- Hungry Birds
- Abu Bakar

This is a direct person-centered investment and does not require an external wallet.

---

# 17. INVESTMENT OWNERSHIP REQUIREMENTS

Ownership means:

> Which Foundation fund source contributed how much capital to the investment?

Example:

Investment = 35,000 BDT

- Samrat contribution = 20,000
- Moin contribution = 15,000

Ownership remains:

- Samrat = 20,000
- Moin = 15,000

Ownership does not change merely because custody changes.

---

# 18. INVESTMENT CUSTODY REQUIREMENTS

Custody means:

> Where the Foundation's money currently resides.

Possible custody locations include:

- Moin Cash
- Moin Bank
- Moin bKash
- Samrat Cash
- Samrat Nagad
- Samrat bKash
- GrowUp Wallet
- Zayan Wallet
- Investment Project
- External Person / Abu Bakar

Ownership and custody must be maintained as separate records/concepts.

Receiving Foundation money into Moin's account does not make Moin the owner.

---

# 19. INVESTMENT PROJECT REQUIREMENTS

At minimum, the system shall support:

- ProjectID
- SerialNo
- InvoiceNo
- ProjectName
- ProjectType
- BorrowerName
- BorrowerPhone
- StartDate
- MaturityDate
- DurationMonths
- PaymentDate
- ActualReturnDate
- InvestedAmount
- ExpectedProfitPct
- ExpectedProfit
- ExpectedTotalReturn
- ActualReturn
- ActualProfit
- ProfitLoss
- Accountant1
- Amount1
- Accountant2
- Amount2
- AccountName
- ReinvestedFrom
- SourceType
- Status
- Notes

The MERN implementation may normalize these into related entities.

---

# 20. EXTERNAL WALLET INVESTMENT FLOW

Example:

Agro Stock investment = 35,000 BDT

Contributions:

- Samrat = 20,000
- Moin = 15,000

At investment:

- Samrat custody decreases by 20,000
- Moin custody decreases by 15,000
- Agro Stock/project investment increases by 35,000

## 20.1 Investment Maturity

Example:

Principal = 35,000  
Profit = 6,825  
Total return = 41,825

If the return remains in GrowUp Wallet:

- project principal is settled;
- profit is recorded;
- GrowUp Wallet increases by 41,825;
- accountant balances do not increase yet.

The return is not considered an accountant cash receipt until custody actually moves to an accountant-controlled location.

---

# 21. REINVESTMENT REQUIREMENTS

Example:

GrowUp Wallet = 41,825

New Potato investment = 50,000

Additional funds:

- Samrat = 5,000
- Moin = 3,175

Effects:

- GrowUp Wallet decreases by 41,825
- Samrat custody decreases by 5,000
- Moin custody decreases by 3,175
- Potato investment increases by 50,000

The old 41,825 must not be deducted from the accountants again.

Only newly supplied funds reduce accountant custody.

---

# 22. WALLET-TO-ACCOUNTANT FUND TRANSFER

Example:

GrowUp Wallet = 120,000

Transfer:

GrowUp Wallet → Moin Bank = 120,000

This is:

**Custody/Fund Transfer**

It is not:

- investment;
- revenue;
- profit;
- member contribution;
- expense.

Effects:

- GrowUp Wallet -120,000
- Moin Bank +120,000

Ownership does not automatically change.

---

# 23. DIRECT EXTERNAL-PERSON INVESTMENT

Example:

Hungry Birds / Abu Bakar

Total investment = 60,000

Contributions:

- Samrat = 50,000
- Moin = 10,000

If Abu Bakar pays Moin 8,500 profit:

- profit = 8,500;
- principal may remain partly outstanding;
- Moin's receipt is a custody event;
- Moin does not become owner of Samrat's contribution.

Later principal may be returned to different custody locations.

The system must support return allocation that does not necessarily match the original funding source.

---

# 24. INVESTMENT RETURN REQUIREMENTS

Returns may be received:

- by Moin;
- by Samrat;
- into an external wallet;
- into Foundation bank;
- partially;
- in multiple installments;
- as principal separately;
- as profit separately.

Minimum conceptual return data:

- ReturnID
- InvestmentID
- ReceivedDate
- ReceivedBy
- CustodyLocation
- TotalReceived
- PrincipalPortion
- ProfitPortion
- OutstandingPrincipal
- OutstandingProfit where applicable
- Notes

The system must not assume one investment has one return or that returns always go to original contributors.

---

# 25. PROFIT, PRINCIPAL AND SETTLEMENT REQUIREMENTS

The system shall distinguish:

- invested principal;
- principal returned;
- profit returned;
- outstanding principal;
- outstanding profit where applicable;
- actual profit;
- loss;
- settlement status.

Profit must not be inferred merely from cash movement.

The system must support partial and installment-based returns.

---

# 26. EXPENSE REQUIREMENTS

Expenses are separate financial events.

Minimum fields:

- ExpenseID
- Date
- Category
- Description
- Amount
- PaymentMethod
- PaidBy
- Notes
- Supporting reference/document where applicable

Expenses must not be mixed with:

- member contribution;
- investment principal;
- investment profit;
- custody transfers.

---

# 27. FINANCIAL EVENT CLASSIFICATION

## 27.1 Cash In

Examples:

- member principal payment;
- member penalty;
- CO charge;
- investment return;
- profit;
- other legitimate income.

## 27.2 Cash Out

Examples:

- investment principal;
- expenses;
- refunds;
- member exit payments;
- other legitimate cash-out events.

## 27.3 Internal Transfer

Examples:

- Accountant → Wallet
- Wallet → Accountant
- Bank → Cash
- Cash → Bank
- custody location → another custody location

Internal transfers must not be counted as income or expense.

---

# 28. MONTHLY PAYMENT STATUS

The system should support statuses including:

- PAID
- PARTIAL
- DUE
- ADVANCE_COVERED
- WAIVED
- OVERDUE
- REVIEWED
- CORRECTED

A future month covered by advance must not generate a duplicate payment event.

---

# 29. MEMBER FINANCIAL SUMMARY

The system must provide a single location for a member's financial history.

Minimum summary:

- Member ID
- Member Name
- Current/final shares
- Total principal paid
- Total penalties paid
- Total penalties waived
- Total due
- Total advance
- 2024 collection
- 2025 collection
- 2026 collection
- investment contribution
- investment return
- investment profit
- investment loss
- applicable expenses
- historical monthly payment status
- share history
- outstanding position

## 29.1 Annual Member Summary

For each member and year:

- Total collection
- Total penalty paid
- Total penalty waived
- Total due
- Total advance
- Investment contribution
- Return
- Profit
- Loss

---

# 30. REPORTING REQUIREMENTS

The system shall support:

- monthly member reports;
- annual reports;
- member statements;
- collection summaries;
- penalty summaries;
- waiver summaries;
- due summaries;
- accountant custody summaries;
- expense summaries;
- investment summaries;
- profit/loss summaries;
- project-wise investment reports;
- wallet/custody reports;
- ownership reports;
- annual closing reports;
- reconciliation reports.

Reports should support export to:

- PDF;
- Excel/CSV;
- image/shareable member statement where appropriate.

---

# 31. MEMBER STATEMENT REQUIREMENTS

Each member must be able to receive a clear statement containing:

- member identity;
- share history;
- monthly obligations;
- monthly payments;
- payment dates;
- penalties;
- waived penalties;
- total paid;
- total due;
- advance payments/coverage;
- annual totals;
- investment participation where applicable;
- investment return/profit/loss where applicable.

The statement must be downloadable/shareable as PDF or image according to the supplied requirement.

---

# 32. ANNUAL REPORT AND AUDIT REQUIREMENTS

The system must support annual closing and annual reporting.

## 32.1 Annual Report Contents

At minimum:

- opening balances;
- expected collections;
- actual collections;
- dues;
- penalties;
- waived penalties;
- expenses;
- investments;
- investment returns;
- profit/loss;
- custody movements;
- closing balances;
- member-level summary;
- reconciliation summary.

## 32.2 2024 Validation Requirement

The 2024 audit report has already been published from Google Sheets.

After migration, the system must generate a 2024 report and compare it against the published historical report.

Any mismatch must be reviewable and explainable.

## 32.3 Year Closing

Each December:

- close the accounting year;
- reconcile member collections;
- reconcile penalties;
- reconcile expenses;
- reconcile investments;
- reconcile custody;
- reconcile profit/loss;
- prepare member summaries.

The following January should publish the annual audit/report.

Closed years should be locked against normal edits.

Corrections to closed years require Super Admin authorization and audit logging.

Investment records remain open when investments cross year boundaries.

---

# 33. POLICY / GUIDELINES MODULE

The application shall provide a dedicated policy section:

**“এন এস ফাউন্ডেশন এর নীতিমালা”**

It shall contain the organization's formal rules in serial order.

The policy should cover, at minimum:

1. organization name;
2. cooperative/social nature;
3. no interest-based business;
4. investment risk;
5. five-year term;
6. minimum members;
7. NS-12 restriction;
8. monthly share value;
9. 2024 share-change rule;
10. membership admission;
11. share transfer;
12. payment deadline;
13. penalty;
14. member withdrawal;
15. mobile banking charge policy;
16. bank payment policy;
17. membership requirements;
18. savings/bank-account policy;
19. lawful/halal investment policy;
20. term completion/extension;
21. meeting requirements;
22. annual meetings;
23. advance payment;
24. three-month default rule;
25. accountant reporting responsibility;
26. authority to amend rules;
27. disciplinary policy;
28. private personal transactions outside organizational liability.

Policy editing:

- authorized Super Admin only;
- versioned;
- fully audited.

---

# 34. USER ROLES AND PERMISSIONS

The system shall support three primary roles.

## 34.1 Super Admin

Full permissions including:

- Members
- Payments
- Expenses
- Investments
- Configuration
- Users
- Roles
- Policies
- Audit
- Reporting
- Migration
- Maintenance
- Historical corrections
- Accountant functions
- Investment Manager functions

## 34.2 Accountant

Current accountants:

- Moin
- Samrat

Accountant permissions include:

- view members;
- add/manage members where allowed;
- payment entry;
- expenses;
- monthly accounting tools;
- applicable operational functions.

Accountants must not normally be able to:

- change sensitive member records;
- delete members;
- change roles;
- change system configuration;
- change investment architecture;
- modify restricted financial rules unless explicitly authorized.

## 34.3 Investment Manager

Full investment permissions:

- projects;
- investments;
- contributions;
- returns;
- reinvestment;
- external wallet custody transfers;
- investment settlement.

Other modules are view-only unless explicitly permitted.

---

# 35. BACKEND AUTHORIZATION

Frontend permission hiding is never sufficient.

Every protected API endpoint must enforce authorization server-side.

The backend must not trust:

- hidden buttons;
- client-side role state;
- localStorage roles;
- browser parameters;
- other client-controlled permission indicators.

---

# 36. USER MANAGEMENT

Super Admin shall be able to:

- create users;
- deactivate users;
- assign roles;
- control allowed permissions where required;
- provide access recovery/reset flow;
- review activity.

All privilege-changing events must be audited.

---

# 37. AUDIT LOG REQUIREMENTS

AuditLog is mandatory.

Critical audited operations include:

- login/security events;
- member creation/edit/archive;
- payment creation/edit/correction;
- penalty adjustment;
- waiver creation/edit;
- investment creation;
- investment contribution;
- return;
- reinvestment;
- custody transfer;
- fund transfer;
- expense;
- configuration change;
- permission change;
- deletion/archive;
- migration;
- report correction;
- reversal/undo;
- historical corrections.

Audit records should include:

- timestamp;
- user;
- action;
- entity;
- entity ID;
- before state;
- after state;
- source;
- reason.

Normal users must not be able to edit audit records.

A yearly audit report must be generatable in a controlled, repeatable process.

---

# 38. DELETE, ARCHIVE AND REVERSAL REQUIREMENTS

Destructive actions must:

- show confirmation;
- explain consequences;
- require explicit confirmation;
- prefer archive/soft-delete where financial history would otherwise be damaged.

Historical financial data must never be silently destroyed.

## 38.1 Financial Reversal

Where financially safe, corrections must use:

- reversal records;
- compensating transactions;
- audit history.

Do not rewrite or physically delete historical accounting transactions to undo them.

Example:

Original: +5,000  
Correction: -5,000 reversal  
Replacement transaction: +corrected amount if required

This preserves the audit trail.

---

# 39. CONFIGURATION REQUIREMENTS

Administrative configuration shall include, as applicable:

- monthly share rate;
- payment deadline day;
- penalty rules;
- penalty waiver settings;
- gateway rates;
- membership rules;
- withdrawal rules;
- fiscal-year behavior;
- organization profile;
- reporting configuration;
- system announcements;
- feature flags;
- accountant management;
- other future business settings.

Configuration changes must be audited.

Historical calculations must be protected from accidental retroactive mutation.

## 39.1 Effective-Dated Configuration

Rules that can change over time must support:

- EffectiveFrom
- EffectiveTo
- Active
- Reason where appropriate

Historical rates must remain reproducible.

---

# 40. HISTORICAL DATA MIGRATION

The existing Google Sheets are historical source data, not the target architecture.

## 40.1 Historical Sources

Expected historical sources include:

- 2024 January–December monthly Sheets;
- Jan–Apr 2025 structured Sheets;
- May 2025–Aug 2026 payment/receipt evidence;
- investment records;
- expense records;
- share history;
- penalty waiver records;
- other verified supporting evidence.

## 40.2 Migration Pipeline

Required pipeline:

`Original Sources → Migration Staging → Validation → Deduplication → Normalization → Review → Reconciliation → Production MongoDB`

Do not overwrite original historical files.

## 40.3 Migration Status

Historical records must support:

- VERIFIED
- REVIEW_REQUIRED
- UNRESOLVED

Missing or ambiguous data must never be silently invented.

## 40.4 Historical Source References

Imported records should preserve:

- SourceYear
- SourceMonth
- SourceSheet
- SourceRow
- SourceReference
- Original comments where applicable

## 40.5 Historical Transaction IDs

Old Google Sheets do not need manually entered Transaction IDs.

During migration, the new system must generate permanent immutable IDs.

Example:

`PAY-2024-000001`

Historical source references must still be preserved.

---

# 41. MIGRATION RECONCILIATION

Before declaring migration complete, compare historical source data against MongoDB for at least:

- member count;
- total shares;
- monthly collections;
- total penalties;
- total waivers;
- total outstanding;
- total advance;
- total expenses;
- total investment;
- investment returns;
- profit/loss;
- accountant custody;
- wallet balances.

Every mismatch must be reviewable.

The migration process must never silently overwrite verified historical accounting.

---

# 42. DATA MODEL REQUIREMENTS

The application shall use normalized domain entities.

Recommended logical collections/entities include:

- members
- shareHistories
- payments
- paymentAllocations
- monthlyLedgers
- penaltyRules
- penaltyWaivers
- gatewayRates
- expenses
- investmentProjects
- investmentContributions
- investmentOwnership
- investmentReturns
- investmentSettlements
- custodyAccounts
- custodyMovements
- reinvestments
- fundTransfers
- users
- roles
- permissions
- auditLogs
- systemConfigs
- policies
- policyVersions
- migration/staging records where required

The application must not rely on one giant financial table.

Monthly Sheets must not be reproduced as separate MongoDB collections merely because the legacy system used monthly Sheets.

Monthly views/reports should be derived from normalized domain data.

---

# 43. PAYMENT ALLOCATION DATA REQUIREMENTS

Payment and allocation must remain separate.

A payment should contain the actual receipt information.

Allocation records should identify the contribution periods covered by that payment.

This separation is required for:

- advance payments;
- previous dues;
- backdated payments;
- historical migration;
- accurate reporting;
- duplicate prevention;
- auditability.

---

# 44. DATA INTEGRITY REQUIREMENTS

The system must enforce:

- non-negative monetary values;
- valid dates;
- valid MemberID references;
- valid project references;
- valid accountant references;
- valid gateway references;
- valid custody-account references;
- no duplicate active waiver for a month;
- no duplicate effective ShareHistory month for the same member;
- no duplicate immutable payment record;
- no double-counting of advance payments;
- no double-counting of custody transfers;
- no principal duplication during reinvestment;
- no invalid coverage ranges;
- no negative TotalDue;
- no negative AdvanceBalance;
- no unauthorized historical mutation.

---

# 45. DUPLICATE PAYMENT PREVENTION

The system must prevent accidental duplicate payment submission.

Potential duplicate-check inputs include:

- memberId;
- paymentDate;
- amount;
- gateway;
- receiver;
- sourceReference.

Historical migration must use source references and reconciliation rather than relying only on naive duplicate matching.

---

# 46. ATOMICITY AND CONCURRENCY

Financial mutations must be atomic.

If multiple records belong to one financial business event, either:

**all succeed**

or:

**all roll back**

No partially updated financial state is acceptable.

Transactional safeguards are required for:

- payment posting;
- investment contribution;
- investment return;
- wallet transfer;
- reinvestment;
- expense posting;
- year closing.

The system should use idempotency keys where useful to prevent duplicate submissions.

---

# 47. PAYMENT POSTING ATOMIC OPERATION

A normal payment posting should conceptually perform:

1. create payment;
2. create payment allocation(s);
3. update affected ledger state;
4. create audit record.

The operation must succeed or roll back as an atomic unit where database transaction support is applicable.

---

# 48. PERFORMANCE REQUIREMENTS

The new system must be significantly more responsive than the old Google Apps Script implementation.

It must avoid:

- full-table scans for normal requests;
- rebuilding every member ledger after every payment;
- blocking the UI on heavy reports;
- repeated calculation of unchanged data.

The implementation should use:

- indexed MongoDB queries;
- database transactions where needed;
- background queues;
- Redis-backed workers where appropriate;
- cached summaries where appropriate;
- incremental ledger updates.

A backdated payment should affect only:

- the affected member;
- the affected month;
- subsequent affected months.

It must not trigger unnecessary full-system recalculation.

---

# 49. BACKGROUND JOB REQUIREMENTS

## Immediate Operations

- login;
- member save;
- payment save;
- expense save;
- investment entry.

## Background Operations

- affected-member ledger recalculation;
- annual report generation;
- historical import;
- large reconciliation;
- dashboard summary rebuild;
- notification/report generation.

The UI must not be blocked by heavy background work.

---

# 50. USER EXPERIENCE REQUIREMENTS

The application should provide:

- fast normal saves;
- immediate save confirmation;
- affected-member view update after successful payment;
- visible recalculation status when background work is pending;
- clear validation errors;
- responsive screens;
- pagination;
- search;
- filters;
- loading states/skeletons;
- server-confirmed financial state.

Financial values must never be silently accepted as invalid negative amounts.

---

# 51. FRONTEND REQUIREMENTS

Frontend technology baseline:

- React
- TypeScript
- reusable components
- typed API client
- form validation
- pagination
- search
- filtering
- loading states
- clear error handling

Optimistic UI may be used only where financially safe.

Financial state must ultimately be server-confirmed.

---

# 52. BACKEND REQUIREMENTS

Backend baseline:

- Node.js
- TypeScript
- Express or equivalent typed REST API
- MongoDB
- Mongoose or equivalent ODM
- typed DTOs;
- server-side business validation;
- service/domain layer;
- centralized error handling;
- structured logging.

Business logic must not be placed primarily inside React components or route handlers.

All critical business rules must be enforced server-side.

---

# 53. SECURITY REQUIREMENTS

The application shall implement defense-in-depth, including:

- secure password hashing;
- secure authentication;
- protected sessions/tokens;
- least-privilege authorization;
- RBAC;
- backend authorization;
- rate limiting;
- brute-force protection;
- input validation;
- schema validation;
- secure HTTP headers;
- CSRF protection where relevant;
- XSS protection;
- injection protection;
- safe query construction;
- secure secret management;
- environment-variable separation;
- HTTPS in production;
- secure cookie configuration where cookies are used;
- no secrets in frontend source;
- no hard-coded credentials;
- IDOR protection;
- audit logging;
- sensitive-action confirmation;
- safe file-upload handling where uploads exist;
- dependency security review;
- backup/recovery strategy;
- production errors that do not expose internal details.

The system must never claim to be “100% secure”. It must maintain a documented security baseline and threat model.

---

# 54. SECURITY OF FINANCIAL OPERATIONS

Sensitive actions require:

- authenticated session;
- authorized role;
- server-side validation;
- transaction integrity;
- audit logging.

Examples:

- changing shares;
- changing penalty waivers;
- editing payments;
- modifying investments;
- settling returns;
- transferring wallet funds;
- changing roles;
- changing configuration;
- deleting/archiving records.

---

# 55. YEAR-AGNOSTIC DESIGN

The system must not hard-code 2025 or any single year throughout business logic.

It must support:

- 2024;
- 2025;
- 2026;
- 2027;
- 2028;
- future extended periods.

Use:

- dates;
- periods;
- year filters;
- effective-from/effective-to rules;
- configuration.

---

# 56. ANNUAL CLOSING BEHAVIOR

Year closing must:

- lock prior-year normal edits;
- preserve audit trail;
- produce closing summaries;
- carry outstanding dues correctly;
- carry legitimate advance coverage correctly;
- preserve historical investment state;
- preserve custody state;
- preserve profit/loss state;
- reconcile the year.

The investment module itself must not be forcibly closed merely because the accounting year closes.

Corrections to closed years require Super Admin authorization and audit logging.

---

# 57. REQUIRED REPORTING AREAS

The system should provide dashboards/reports for:

### Member
- shares;
- principal paid;
- penalties;
- waived penalties;
- current due;
- advance;
- yearly collection;
- investment participation;
- returns;
- profit/loss.

### Collection
- monthly collection;
- yearly collection;
- collector/accountant;
- gateway;
- principal;
- penalty;
- CO charge;
- total cash received.

### Due
- member-wise due;
- monthly due;
- overdue;
- previous due;
- advance coverage.

### Accountant/Custody
- custody by accountant;
- custody by account;
- cash;
- bank;
- bKash;
- Nagad;
- wallet balances;
- transfers.

### Investment
- project-wise investment;
- ownership;
- accountant contribution;
- custody location;
- expected profit;
- actual return;
- actual profit;
- loss;
- outstanding principal;
- reinvestment;
- wallet balance;
- fund transfer;
- settlement status.

### Expense
- category;
- period;
- amount;
- payment method;
- payer.

### Annual
- opening;
- collection;
- penalties;
- waivers;
- expenses;
- investments;
- returns;
- profit/loss;
- custody movements;
- closing;
- reconciliation.

---

# 58. TESTING REQUIREMENTS

The final system must have automated tests covering at least:

## 58.1 Payment Tests

- on-time payment;
- late payment;
- no payment;
- partial payment;
- full payment;
- advance payment;
- previous dues + current + advance;
- penalty payment;
- penalty waiver;
- CO charge;
- mixed gateways;
- mixed accountants/receivers.

## 58.2 Coverage Tests

- January–June coverage;
- February payment covering January–June;
- mid-year advance;
- coverage expiry;
- no double counting;
- invalid coverage range;
- partial future-month amount.

## 58.3 Investment Tests

- two accountants funding one project;
- return to external wallet;
- wallet reinvestment;
- partial external funding;
- one accountant receiving a return for multiple owners;
- principal/profit split;
- partial return;
- custody transfer;
- ownership remaining unchanged after custody transfer.

## 58.4 Security Tests

- unauthorized edit;
- unauthorized deletion;
- unauthorized configuration change;
- unauthorized waiver;
- unauthorized investment modification;
- unauthorized historical correction.

## 58.5 Migration Tests

- duplicate detection;
- source mapping;
- validation;
- reconciliation;
- unresolved records;
- 2024 report comparison.

---

# 59. IMPLEMENTATION QUALITY REQUIREMENTS

The implementation should use:

- strict TypeScript;
- schema validation;
- typed DTOs;
- typed service layers;
- repository/data-access abstraction where useful;
- centralized error handling;
- structured logging;
- automated tests;
- modular domain/business services.

Business logic should be separated from presentation and transport layers.

---

# 60. ARCHITECTURAL MODULES

The system should be organized into logical modules such as:

1. Authentication
2. Users & Permissions
3. Members
4. Share History
5. Payments
6. Payment Allocations
7. Monthly Ledger
8. Penalties
9. Penalty Waivers
10. Payment Gateways
11. Accountants
12. Custody Accounts
13. Expenses
14. Investments
15. Investment Ownership
16. Investment Contributions
17. Investment Returns
18. Investment Settlement
19. Reinvestment
20. Fund Transfers
21. Reports
22. Annual Closing
23. Policy Management
24. Configuration
25. Audit Logs
26. Historical Migration
27. Reconciliation
28. System Maintenance

---

# 61. NON-FUNCTIONAL REQUIREMENTS

The system shall be:

### Reliable
Financial mutations must be atomic and traceable.

### Auditable
Critical changes must have immutable audit records.

### Secure
Authorization must be enforced server-side with defense-in-depth.

### Maintainable
Business logic must be modular and typed.

### Scalable
Normal operations must avoid full-system recalculation.

### Performant
Queries must use appropriate indexes and background processing for heavy work.

### Recoverable
Backups and recovery procedures must protect historical financial data.

### Extensible
The system must support future years and future reporting/accounting features.

### Migration-safe
Historical source evidence must remain preserved and reconciliable.

### Responsive
Normal data entry must not be blocked by heavy report/ledger operations.

---

# 62. BACKUP AND RECOVERY REQUIREMENT

The production system must maintain a documented backup/recovery strategy covering:

- MongoDB data;
- critical configuration;
- audit history;
- migration records;
- generated reports where required;
- uploaded supporting documents where applicable.

Recovery procedures must preserve accounting integrity and auditability.

---

# 63. CORE BUSINESS INVARIANTS

The following invariants are mandatory:

1. MemberID is permanent and unique.
2. Member name is not a primary identifier.
3. Share changes are effective-month based.
4. Normal share changes are locked from 2025 onward.
5. One share = 500 BDT/month unless an authorized effective-dated configuration changes the rule.
6. Payment deadline = 15th unless an authorized effective-dated configuration changes it.
7. Penalty begins from the 16th.
8. Historical penalty rates must be reproducible.
9. Penalty waivers must be explicitly recorded.
10. Principal, penalty and CO charge remain separate.
11. TotalCashReceived = Principal + Penalty + CO Charge.
12. CO charge is not member principal due.
13. Payment and allocation are separate.
14. Future-month coverage does not create new cash transactions.
15. Principal allocation follows oldest outstanding → current → future.
16. Advance balance cannot be negative.
17. TotalDue cannot be negative.
18. Ownership and custody are separate.
19. Internal transfers are not income/expense.
20. Reinvestment must not deduct returned funds from accountants twice.
21. Historical records must not be silently destroyed.
22. Financial corrections should use reversals/compensating records.
23. Critical financial mutations must be atomic.
24. Backend authorization is mandatory.
25. Rates must be configurable and effective-dated.
26. Historical data must retain source references.
27. Unresolved historical data must be explicitly flagged.
28. Annual closing must preserve cross-year investment/custody state.
29. The system must not depend on the old monthly-sheet architecture.
30. The system must preserve full auditability.

---

# 64. EXPLICIT NON-GOALS / PROHIBITED IMPLEMENTATION BEHAVIOR

The system must not:

- copy the Google Sheets architecture one-to-one;
- create one MongoDB collection per month merely because Sheets used monthly tabs;
- store all financial concepts in one untyped transaction table;
- use row count as a financial ID generator;
- trust frontend-only permissions;
- hard-code business rates throughout code;
- duplicate advance payments;
- treat CO charge as principal due;
- treat accountant custody as personal ownership;
- deduct reinvested returned money from an accountant again;
- silently overwrite historical records;
- silently invent missing migration data;
- use current date to rewrite historical accounting;
- perform a full-system recalculation after every small transaction;
- store passwords in plain text;
- expose secrets to the frontend;
- physically delete financial history merely to correct a transaction.

---

# 65. DEFINITIVE ACCOUNTING EXAMPLES

## Example A — January Advance

2 shares = 1,000 BDT/month.

Payment = 6,000 BDT in January.

Coverage:

Jan, Feb, Mar, Apr, May, Jun.

One payment record exists.

Five future months are allocation/coverage outcomes, not five new cash transactions.

## Example B — Previous Dues + Advance

2 shares = 1,000 BDT/month.

January–March unpaid.

April payment:

- Principal = 6,000
- Penalty = 200
- CO charge = 70
- Total = 6,270

Principal covers:

Jan–Jun.

May and June become advance-covered.

## Example C — External Wallet Return

Investment principal = 35,000.

Return = 41,825.

If the 41,825 remains in GrowUp Wallet:

- wallet increases;
- project settles;
- profit = 6,825;
- accountant custody does not increase yet.

## Example D — Wallet Reinvestment

Wallet = 41,825.

New project = 50,000.

New accountant funding = 8,175.

Only the 8,175 is deducted from accountant custody.

## Example E — Custody Transfer

GrowUp Wallet → Moin Bank = 120,000.

This is an internal custody/fund transfer.

It is not income, profit, investment or member contribution.

---

# 66. DEVELOPMENT GOVERNANCE

No production implementation should begin by copying spreadsheet logic directly.

Before implementation, the development team/AI coding agent must work from this SRS as the business-domain baseline.

Any ambiguity that can affect financial balances must be raised for explicit decision.

Architecture may evolve, but it must not violate the business invariants in this document.

---

# 67. RECOMMENDED DEVELOPMENT PHASES

The implementation should proceed in controlled phases:

### Phase 1
Architecture + database schema

### Phase 2
Authentication + RBAC

### Phase 3
Members + Share History

### Phase 4
Payments + Penalties + Waivers + Advance Coverage

### Phase 5
Ledger + Reports

### Phase 6
Expenses

### Phase 7
Investment Ownership + Custody

### Phase 8
Reinvestment + Returns + Settlements + Profit/Principal Disbursement

### Phase 9
Audit + Reversal

### Phase 10
Historical Migration

### Phase 11
Member Statements + Annual Reports

### Phase 12
Production Hardening + Security + Performance

Each phase should have explicit verification checkpoints before moving to the next phase.

---

# 68. FINAL SYSTEM ARCHITECTURAL MODEL

The business model should conceptually follow:

Member

↓

Share History

↓

Monthly Obligation

↓

Payment

↓

Payment Allocation

↓

Monthly Ledger

And separately:

Investment Project

↓

Contribution

↓

Ownership

↓

Return / Settlement

↓

Custody

↓

Reinvestment / Fund Transfer

The system must preserve these boundaries.

---

# 69. FINAL SOURCE RECONCILIATION NOTE

The two supplied documents substantially describe the same business domain. The second document expands and operationalizes the first with development, data-model, security, performance, testing and migration requirements.

One material source discrepancy exists in the penalty-rate wording for historical periods:

- the first document states **January 2024–January 2025 = 20 BDT/share** and **February 2025 onward = 40 BDT/share**;
- the second document explicitly defines **January 2025 = 20 BDT/share** and **February 2025 onward = 40 BDT/share**.

This SRS preserves the more precise effective-date rule for January 2025/February 2025 onward, while requiring the historical 2024 rate to be verified against the authoritative historical records before migration is finalized.

No other financial rule should be inferred from this discrepancy.

---

# 70. FINAL ACCEPTANCE CRITERIA

The NS Foundation system shall be considered requirements-complete only when it can demonstrate that:

- member identities are permanent and traceable;
- 2024 share history is reproducible;
- 2025+ normal share changes are blocked;
- monthly obligations are correctly derived;
- on-time and late payments calculate correctly;
- historical penalties are reproducible;
- waivers work correctly;
- previous dues roll forward correctly;
- one payment can cover previous/current/future principal;
- future advance coverage never duplicates cash;
- partial payments are distinguishable;
- principal, penalty and CO charge remain separate;
- TotalCashReceived is correct;
- accountant custody is distinguishable from ownership;
- investments can have multiple contributors;
- returns can be received in multiple installments and locations;
- reinvestment does not double-deduct principal;
- custody transfers are not counted as income/expense;
- expenses remain separate;
- member statements are complete;
- annual reports are reproducible;
- 2024 migration can be reconciled against the published report;
- unresolved historical records remain flagged;
- critical operations are atomic;
- critical actions are audited;
- unauthorized operations are rejected server-side;
- financial corrections preserve history;
- configuration changes are effective-dated and audited;
- the application is year-agnostic;
- heavy work is processed without blocking normal user operations;
- security, backup and recovery controls are in place.

---

# 71. FINAL PRINCIPLE

The NS Foundation application is not a digital copy of a spreadsheet.

It is a production-grade financial/cooperative management system whose implementation must preserve the organization's actual business meaning while improving:

**correctness → auditability → traceability → migration safety → maintainability → performance → security → long-term reliability.**

The most important domain boundaries remain:

**OWNERSHIP ≠ CUSTODY**

**PRINCIPAL ≠ PENALTY**

**PRINCIPAL ≠ CO CHARGE**

**PAYMENT ≠ ALLOCATION**

**DUE ≠ CASH RECEIVED**

**ADVANCE ≠ NEW TRANSACTION**

**INTERNAL TRANSFER ≠ INCOME/EXPENSE**

These principles are mandatory for all future implementation decisions.



---

# 72. FINAL IMPLEMENTATION AUTHORITY — AUGUST 2026

For implementation, the priority order is:

1. This Version 2.0 SRS and its Final Owner Clarifications.
2. Explicit subsequent organizational decisions.
3. Earlier SRS sections where they do not conflict.
4. Technical architecture documents.
5. AI-agent assumptions — lowest authority.

Any earlier requirement for member-to-project investment ownership is superseded by the **common pooled investment model** unless explicitly reinstated later. Any earlier requirement that monthly 2024 share history alone determines final distribution is superseded by the **December 2024 Final Share + annual reconciliation rule**. Any earlier permission for normal share changes after 31 December 2024 is superseded by the **2025+ Share Lock**. Any earlier assumption that investment return automatically becomes accountant cash is superseded by the **actual custody-transfer rule**.

The post-2024 transferred-share accumulated-entitlement rule remains **PENDING ORGANIZATIONAL DECISION** and must not be invented by the implementation agent.

## 72.1 Final Business Flow

```text
MEMBER
  ↓
MONTHLY CONTRIBUTION
  ↓
MOIN / SAMRAT FOUNDATION CUSTODY
  ↓
COMMON POOLED FUND
  ↓
INVESTMENT PROJECT / EXTERNAL WALLET
  ↓
ACTUAL RETURN / PROFIT / LOSS
  ↓
REINVESTMENT OR CUSTODY TRANSFER
  ↓
FINAL ASSET CONSOLIDATION
  ↓
LESS APPROVED EXPENSES / LIABILITIES
  ↓
FINAL DISTRIBUTABLE FUND
  ↓
MEMBER DISTRIBUTION ACCORDING TO FINAL SHARE POLICY
```

## 72.2 Final Financial Separation

**MEMBER ENTITLEMENT ≠ ACCOUNTANT CUSTODY**

**MEMBER PAYMENT ≠ PAYMENT ALLOCATION**

**PRINCIPAL ≠ PENALTY**

**PRINCIPAL ≠ CO CHARGE**

**ADVANCE CREDIT ≠ NEW CASH TRANSACTION**

**INVESTMENT PRINCIPAL ≠ INVESTMENT PROFIT**

**EXPECTED ROI ≠ ACTUAL PROFIT**

**INVESTMENT RETURN ≠ AUTOMATIC ACCOUNTANT CASH**

**REINVESTMENT ≠ NEW ACCOUNTANT DEDUCTION FOR OLD FUNDS**

**INTERNAL CUSTODY TRANSFER ≠ INCOME/EXPENSE**

**EXPENSE ≠ INVESTMENT**

**2024 INTERIM SHARE CHANGE ≠ FINAL 2024 SHARE ENTITLEMENT**

These boundaries are mandatory unless the organization explicitly approves a change.

# END OF FINAL SYSTEM REQUIREMENTS SPECIFICATION v2.0

