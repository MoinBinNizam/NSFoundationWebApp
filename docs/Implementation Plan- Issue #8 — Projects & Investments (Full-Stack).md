# Implementation Plan: Issue #8 — Investment Management Module (Full-Stack)

Implement the full-stack **Investment Management Module** fulfilling **GitHub Issue #8** in accordance with [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md) (Section 16 & 19), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) (Section C "Investment Model"), [`docs/BUSINESS-RULES.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/BUSINESS-RULES.md), and user-specified authoritative rules.

---

## 1. Authoritative Business Rules & Domain Architecture

1. **Common Pooled Investment Fund (SRS Section 16 & Business Rules)**:
   - Member contributions form a single pooled society investment fund.
   - The system **does NOT** allocate project-level investment ownership to individual members.
2. **Multi-Accountant Project Investment**:
   - Multiple accountants can supply money for an investment into the same project.
   - E.g., for a ৳30,000 GROWUP NGO agricultural project:
     - **Moin** supplies **৳20,000** from *Moin Islami Bank*.
     - **Samrat** supplies **৳10,000** from *Samrat Personal Nagad*.
   - Each funding entry creates an [`InvestmentFunding`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/InvestmentFunding.ts) record and an atomic [`CustodyMovement`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/CustodyMovement.ts) (`OUT`, `sourceType: INVESTMENT_FUNDING`) from that specific custody account.
   - Money decreases from the respective accountant custody accounts.
   - **Crucial Rule**: Moving money from accountant custody to an investment is **NOT** an expense; it is an investment asset transfer.
   - Sourcing is validated against each account's real-time derived balance.
3. **Project Investment Lifecycle Updates (Minimum Two Stages)**:
   - **Stage 1 (Initial Investment)**: Recording the project, start date, duration (months), maturity date, category, external partner (e.g. GROWUP NGO, Zayan), target principal, expected ROI % (e.g. 40%), and recording initial funding from one or multiple accountants. Status: `ACTIVE`.
   - **Stage 2 (Maturity & Settlement)**: Recording the maturity event, principal returned, actual profit, actual loss, total return amount, and settlement destination. Status: `MATURED` / `CLOSED`.
4. **Flexible Return Destinations (Single Accountant or Org Wallet)**:
   - Even when multiple accountants provided investment funds, the return (principal + profit) can:
     - **Option A (Accountant Custody)**: Return directly to a single accountant's account (e.g., Moin Islami Bank, Cash, or Nagad) by bank transfer from the organization. Atomically logs `CustodyMovement` (`IN`, `sourceType: INVESTMENT_RETURN`).
     - **Option B (Organization Wallet)**: Remain in the investment organization's wallet (e.g., *GrowUp Wallet* or *Zayan Wallet*, `accountType: EXTERNAL_WALLET`) ready for reinvestment. Logs `CustodyMovement` (`IN`, `sourceType: INVESTMENT_RETURN`) into the external wallet custody account without artificially inflating personal accountant balances.
5. **Reinvestment with Wallet Custody Money + Optional New Accountant Funds**:
   - The matured amount (principal + profit) residing in an organization wallet can be reinvested into a new project within that organization (or split across multiple projects).
   - During reinvestment, accountants can also contribute additional new custody money alongside the wallet money (e.g. ৳42,000 from GrowUp Wallet + ৳8,000 new cash from Moin Bank = ৳50,000 new project).
   - Only newly added custody funds generate `OUT` movements from accountant accounts; wallet money moves from the wallet account.

---

## 2. Proposed Changes

### Backend Components

#### [NEW] [investment.service.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/investment.service.ts)
- `createProject(input, actingUser)`: Create project with `projectId` (e.g. `PRJ-YYYYMM-XXXX`), name, category, duration, expectedROI %, externalEntity (e.g. "GROWUP NGO", "Zayan"), targetPrincipal, and optional immediate funding items.
- `fundProject(input, actingUser)`: Supports funding from one or multiple custody accounts simultaneously (e.g. `[{ custodyAccountId, amount }]`). Validates balances, creates `InvestmentFunding` records, logs `CustodyMovement (OUT)` for each, increments `project.totalFunded`, and updates project status to `ACTIVE`.
- `getProjects(filters)`: Query projects with status, category, partner entity, and date filters with aggregated funded amounts and returns.
- `getProjectById(id)`: Comprehensive view of project details, co-investor funding breakdown, returns history, and net performance.
- `recordProjectReturn(input, actingUser)`: Records maturity return (`principalReturned`, `actualProfit`, `actualLoss`, `totalReturn`). Deposits to selected destination (`destinationType`: `ACCOUNTANT_CUSTODY` or `EXTERNAL_WALLET` like GrowUp Wallet). Atomically logs `CustodyMovement (IN)` to the destination account and sets project status to `MATURED`.
- `reinvestProjectFunds(input, actingUser)`: Reinvest wallet custody funds into a new project, with optional additional new accountant custody funding.
- `getInvestmentStats()`: Portfolio-wide summary: Total Capital Invested, Active Invested Capital, Total Principal Returned, Total Realized Profit, Total Losses, Net Realized Gain, and Overall Portfolio ROI %.

#### [NEW] [investment.controller.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/investment.controller.ts)
- Express route controllers for listing projects, project details, project creation, multi-accountant funding, return recording, reinvestment, and summary metrics.

#### [NEW] [investment.routes.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/investment.routes.ts)
- Mounted at `/api/investments`.
- Protected with `authenticate` and `requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT)`.

#### [MODIFY] [app.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts)
- Mount `app.use('/api/investments', investmentRoutes)`.

#### [NEW] [test-investments.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/test-investments.ts)
- Automated end-to-end integration test verifying:
  1. Creating a GROWUP NGO project (Target: ৳30,000, 6 months, 40% expected ROI).
  2. Co-funding from multiple accountants: Moin Bank (৳20,000) and Samrat Nagad (৳10,000).
  3. Verifying twin custody deductions on Moin Bank and Samrat Nagad.
  4. Maturing the project with 40% profit (৳30,000 principal + ৳12,000 profit = ৳42,000 return).
  5. Returning to Moin Islami Bank (or GrowUp Wallet) and verifying the single destination custody credit.
  6. Reinvesting wallet funds into a subsequent project with additional accountant funds.

---

### Frontend Components

#### [MODIFY] [Layout.tsx](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx)
- Enable `/investments` navigation item with badge `Issue #8` and icon `TrendingUp`.

#### [MODIFY] [App.tsx](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx)
- Mount route `<Route path="investments" element={<InvestmentsPage />} />`.

#### [NEW] [InvestmentsPage.tsx](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/InvestmentsPage.tsx)
- Modern, responsive Tailwind CSS UI:
  - **Summary Metrics Header**: Total Invested, Active Investments, Realized Profit, Net ROI %, Portfolio Projects.
  - **Tabs**:
    - **Tab 1: Projects Portfolio**: Grid and Table view with status pills (`ACTIVE`, `MATURED`, `PROPOSED`), category badges, expected ROI vs actual return, partner tag (e.g. GROWUP NGO), funding progress, and quick actions.
    - **Tab 2: Investment Funding Ledger**: View multi-accountant contributions per project with account details.
    - **Tab 3: Returns & Wallet Ledger**: View realized returns, principal, profits/losses, and destination accounts.
  - **Modals**:
    - **New Project Modal**: Input project ID, name, partner, category, target principal, duration, start date, expected ROI %.
    - **Fund Project Modal (Multi-Accountant)**: Dynamic lines allowing Moin, Samrat, or other accounts to contribute specific amounts with live balance checks.
    - **Record Return / Mature Modal**: Input returned principal, actual profit/loss, and select destination (e.g. Moin Bank or GrowUp Wallet).
    - **Reinvest Modal**: Allocate funds from an organization wallet to a new project with optional new accountant custody top-up.
    - **Project Details Drawer / Modal**: Complete drill-down of all co-fundings, return events, and net ROI.

---

## 3. Verification Plan

- Run `npm run typecheck --prefix backend` $\rightarrow$ 0 errors.
- Run `npm run build --prefix frontend` $\rightarrow$ 0 errors.
- Run `npx tsx src/scripts/test-investments.ts` verifying multi-accountant funding, single accountant return, wallet deposit, and reinvestment.
- Generate updated walkthrough: `docs/Walkthrough- Issue #8 — Investment Management (Full-Stack).md`.
