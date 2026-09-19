# Walkthrough: Issue #8 — Investment Management (Full-Stack Complete)

Implemented the authoritative **Investment Management Module** fulfilling **GitHub Issue #8** in compliance with [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md) (Sections 16, 19), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) (Section C "Investment Model"), [`docs/BUSINESS-RULES.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/BUSINESS-RULES.md), and user-specified authoritative requirements.

---

## 1. Authoritative Business Rules Implemented

1. **Common Pooled Investment Fund (SRS 16.1 & Business Rules)**:
   - Member contributions form a single pooled society investment fund.
   - The system **does NOT** allocate project-level investment ownership to individual members.
2. **Multi-Accountant Project Investment**:
   - Multiple accountants can supply money for an investment into the same project.
   - E.g., for a ৳30,000 GROWUP NGO cattle project:
     - **Moin** supplies **৳20,000** from *Moin Islami Bank*.
     - **Samrat** supplies **৳10,000** from *Samrat Personal Nagad*.
   - Each funding entry creates an [`InvestmentFunding`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/InvestmentFunding.ts) record and an atomic [`CustodyMovement`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/CustodyMovement.ts) (`OUT`, `sourceType: INVESTMENT_FUNDING`) from that specific custody account.
   - Money decreases from the respective accountant custody accounts.
   - **Crucial Rule**: Moving money from accountant custody to an investment is **NOT** a Foundation expense; it is an investment asset transfer.
   - Sourcing is validated against each account's real-time derived balance.
3. **Project Investment Lifecycle (Minimum Two Stages)**:
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
6. **NS Foundation Brand Logo Upload System**:
   - Universal Logo management via `LogoProvider` and `BrandLogo` component.
   - Displays the official logo next to the "NS Foundation" brand text across the Sidebar header, Navbar, and Login page.
   - Allows users/admins to click the logo to upload custom logo images (PNG, JPG, SVG, WebP) with instant local storage persistence and quick reset capability.

---

## 2. Backend Implementation

### A. Investment Service
[`backend/src/services/investment.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/investment.service.ts):
- **`createProject(input, actingUser)`**: Auto-generates sequential `PRJ-YYYYMM-XXXX` identifiers, sets up project parameters (category, target principal, expected ROI, dates, external entity), and supports immediate multi-accountant co-investment.
- **`fundProject(input, actingUser)`**: Atomically deploys capital from one or multiple custody accounts, validates derived balances, logs `InvestmentFunding` records, creates linked `CustodyMovement (OUT, INVESTMENT_FUNDING)` per account, and updates project status to `ACTIVE`.
- **`recordProjectReturn(input, actingUser)`**: Records maturity return (`principalReturned`, `actualProfit`, `actualLoss`, `totalReturn`). Deposits to selected destination (`ACCOUNTANT_CUSTODY` or `EXTERNAL_WALLET`), atomically logs `CustodyMovement (IN, INVESTMENT_RETURN)`, updates project status to `MATURED`, and logs `AuditLog`.
- **`reinvestProjectFunds(input, actingUser)`**: Reinvests organization wallet proceeds into a new project with optional new accountant custody top-up.
- **`getProjects(filters)`**: Aggregates live return metrics, realized profit, outstanding capital, and actual ROI % for every project.
- **`getProjectById(id)`**: Full project drill-down with funding contributions breakdown, returns history, and reinvestment chains.
- **`getInvestmentStats()`**: Portfolio-wide statistics (total capital invested, active deployed capital, total principal returned, total profit realized, total losses, net realized profit, and overall portfolio ROI %).

### B. Controller & Routes
- [`backend/src/controllers/investment.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/investment.controller.ts): Handlers for projects, funding, returns, reinvestment, and statistics.
- [`backend/src/routes/investment.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/investment.routes.ts): Mounted at `/api/investments` in [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts), secured with `authenticate` and `requireAccountant` RBAC.

---

## 3. Frontend Implementation

### A. Navigation & Brand Logo Integration
- [`frontend/src/context/LogoContext.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/context/LogoContext.tsx): Global logo state with upload validation, image FileReader, and persistent storage.
- [`frontend/src/components/BrandLogo.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/BrandLogo.tsx): Interactive logo component allowing instant click-to-upload of the NS Foundation logo anywhere "NS Foundation" text appears.
- [`frontend/src/components/Layout.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx): Embedded `BrandLogo` in sidebar header with edit overlay; enabled `/investments` navigation item with `Issue #8` badge.
- [`frontend/src/pages/LoginPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/LoginPage.tsx): Embedded `BrandLogo` in login header above the "NS Foundation" portal title.
- [`frontend/src/App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx): Mounted `<Route path="investments" element={<InvestmentsPage />} />` wrapped inside `LogoProvider`.

### B. Investments Page Component
[`frontend/src/pages/InvestmentsPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/InvestmentsPage.tsx):
- **Summary Metrics Cards**: Total Capital Invested, Active Capital Deployed, Principal Returned, Realized Profit & Net ROI %.
- **Projects Portfolio View**: Responsive grid with status badges, funding progress bar, expected ROI % vs realized return, partner pills (e.g. `GROWUP NGO`), and quick actions.
- **Interactive Modals**:
  - **New Project Modal**: Create projects with optional immediate multi-accountant co-investment rows.
  - **Fund Project Modal**: Multi-contributor rows allowing Moin, Samrat, or other accounts to invest specific amounts with real-time balance checks.
  - **Record Return / Mature Modal**: Input principal returned, actual profit, actual loss, and select destination account (Single Accountant vs Org Wallet).
  - **Reinvest Modal**: Allocate funds from an organization wallet to a new project with optional new accountant top-up.
  - **Project Drill-Down Drawer**: Complete transparent view of all contributing custody accounts, return history, and net performance.

---

## 4. Automated Integration Verification

Executed automated test suite [`backend/src/scripts/test-investments.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/test-investments.ts) with the following verified outcomes:
1. **Multi-Accountant Co-Funding**:
   - Created project: `GROWUP Cattle Livestock Project #1` (Target: ৳30,000, 6 months, 40% expected ROI).
   - Moin contributed ৳20,000 from *Moin Islami Bank*.
   - Samrat contributed ৳10,000 from *Samrat Personal Nagad*.
   - Verified project status transitioned to `ACTIVE` with `totalFunded` = ৳30,000.
   - Verified Moin Bank balance decreased by exactly ৳20,000.
   - Verified Samrat Nagad balance decreased by exactly ৳10,000.
2. **Project Maturity Return to Single Accountant**:
   - Recorded maturity return with 40% profit: ৳30,000 principal + ৳12,000 profit = ৳42,000 deposited into *Moin Islami Bank*.
   - Verified Moin Bank balance increased by exactly ৳42,000.
   - Verified project status transitioned to `MATURED`.
3. **Organization Wallet Reinvestment**:
   - Deposited ৳40,000 matured proceeds into *GROWUP NGO Wallet* (`EXTERNAL_WALLET`).
   - Reinvested ৳40,000 from *GROWUP NGO Wallet* + ৳10,000 new top-up from *Samrat Personal Nagad* into `GROWUP Summer Maize Project #2` (Total ৳50,000).
   - Verified project #2 became `ACTIVE` with `totalFunded` = ৳50,000.
   - Verified *GROWUP NGO Wallet* balance decreased by ৳40,000.
4. **Typecheck & Production Build**:
   - `npm run typecheck --prefix backend` $\rightarrow$ **0 errors (Exit code 0)**.
   - `npm run build --prefix frontend` $\rightarrow$ **0 errors (Exit code 0)**.
