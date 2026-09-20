# Implementation Plan: Issue #9 — Reinvestment & Project Wallet (Full-Stack)

Implement the full-stack **Reinvestment & Project Wallet Module** fulfilling **GitHub Issue #9** in accordance with [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md) (Sections 16.3 & 19.4), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) (Section C "Investment Model & Reinvestment Chains"), [`docs/BUSINESS-RULES.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/BUSINESS-RULES.md), and the serial development roadmap.

---

## 1. Authoritative Business Rules & Domain Architecture

1. **Segregated External Organization / Project Wallets (SRS 16.3 & Custody Model)**:
   - External partner wallets (e.g. `GROWUP NGO Wallet`, `Zayan Agro Wallet`, `Direct Project Holdings`) hold custody of matured project proceeds (`principalReturned + actualProfit`).
   - Sourced under `CustodyAccount` with `accountType: EXTERNAL_WALLET` and `channel: WALLET`.
   - **Crucial Rule**: Funds resting in an external wallet represent society assets, but do **NOT** inflate accountant personal custody balances until officially withdrawn/transferred into accountant accounts.
   - Balances are derived dynamically via the immutable movement ledger:
     $$\text{Wallet Balance} = \sum \text{IN} - \sum \text{OUT}$$
2. **Blended Reinvestment Engine**:
   - Reinvesting wallet proceeds into a new project (or multiple projects within that partner organization).
   - Funding can be:
     - **Pure Wallet Reinvestment**: 100% funded from wallet custody balance.
     - **Blended Reinvestment**: Wallet funds + New Accountant Custody Top-ups (Moin/Samrat).
   - **Strict Accounting Rule (Business Rules)**:
     - The portion funded from the wallet generates `CustodyMovement (OUT, INVESTMENT_FUNDING)` on the wallet account.
     - Only the newly added accountant funds generate `CustodyMovement (OUT, INVESTMENT_FUNDING)` on the accountant custody account.
     - Both portions are recorded in [`InvestmentFunding`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/InvestmentFunding.ts) and linked in the immutable [`Reinvestment`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/Reinvestment.ts) record.
     - The destination project's `totalFunded` increases by the combined sum and transitions to `ACTIVE`.
3. **Wallet Liquidation / Cashout to Accountant Custody**:
   - Allows withdrawing accumulated wallet proceeds (principal + profit) directly into an accountant custody account (e.g. `GROWUP NGO Wallet` $\rightarrow$ `Moin Islami Bank`).
   - Atomically records twin movements:
     - `OUT` from the external wallet (`sourceType: INTERNAL_TRANSFER`)
     - `IN` to the destination accountant account (`sourceType: INTERNAL_TRANSFER`)
   - Synchronizes derived balances without generating false income or expenses.
4. **Reinvestment Lineage & Chain Tracking**:
   - Complete traceability of funds across project generations:
     $$\text{Project A (Matured)} \xrightarrow{\text{Return}} \text{Org Wallet} \xrightarrow{\text{Reinvestment}} \text{Project B} \xrightarrow{\text{Return}} \dots$$
   - Visualizing the capital trajectory, growth, and blended cash injections.

---

## 2. Proposed Changes

### Backend Components

#### [NEW] [reinvestment.service.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/reinvestment.service.ts)
- `getProjectWallets()`: Query all external organization wallets with live derived balances, total proceeds received, total reinvested, and total liquidated to accountant custody.
- `getWalletTransactions(walletId, query)`: Searchable ledger of all movements for a specific organization wallet.
- `executeReinvestment(input, actingUser)`: Atomically executes reinvestment from wallet into one or multiple destination projects, with optional blended accountant top-up, twin movements, and audit log.
- `liquidateWalletFunds(input, actingUser)`: Withdraws/transfers funds from an external organization wallet into an accountant custody account (e.g. Moin Bank, Samrat Nagad) with twin synchronized movements.
- `getReinvestmentChains(projectId?)`: Traverses `Reinvestment`, `InvestmentFunding`, and `InvestmentReturn` records to generate structured lineage trees showing the complete capital lifecycle.
- `getReinvestmentStats()`: Summary metrics across all project wallets (Total Wallet Holdings, Total Reinvested Proceeds, Total Liquidated to Accountants, Number of Active Chains).

#### [NEW] [reinvestment.controller.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/reinvestment.controller.ts)
- Handlers for wallets list, wallet transactions, executing reinvestments, liquidation cashout, lineage chains, and statistics.

#### [NEW] [reinvestment.routes.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/reinvestment.routes.ts)
- Mounted at `/api/reinvestments` in `backend/src/app.ts`.
- Protected with `authenticate` and `requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT)`.

#### [MODIFY] [app.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts)
- Mount `app.use('/api/reinvestments', reinvestmentRoutes)`.

#### [NEW] [test-reinvestments.ts](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/test-reinvestments.ts)
- Automated integration test script.

---

### Frontend Components

#### [MODIFY] [Layout.tsx](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx)
- Enable the navigation item: `{ label: 'Project Wallets & Reinvest', path: '/reinvestments', icon: Repeat, badge: 'Issue #9' }`.

#### [MODIFY] [App.tsx](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx)
- Mount route `<Route path="reinvestments" element={<ReinvestmentsPage />} />`.

#### [NEW] [ReinvestmentsPage.tsx](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/ReinvestmentsPage.tsx)
- Modern, responsive Tailwind CSS UI:
  - **Summary Metrics Cards**: Total in Org Wallets, Total Reinvested to Date, Total Liquidated to Accountants, Active Reinvestment Chains.
  - **Tabs**:
    - **Tab 1: Organization Wallets**: Cards for each partner wallet (GROWUP NGO Wallet, Zayan Wallet) showing live balance, total inflows, total outflows, quick actions ("Reinvest", "Liquidate to Bank", "Ledger").
    - **Tab 2: Reinvestment Chains & Lineage**: Visual lineage cards illustrating capital trajectory from source project $\rightarrow$ wallet $\rightarrow$ destination project.
    - **Tab 3: Reinvestment Audit Log**: Searchable history of all `Reinvestment` events.
  - **Modals**:
    - **Reinvest Wizard Modal**: Select source wallet, destination project, allocate reinvested amount, optional new accountant custody top-up.
    - **Liquidate / Cashout Modal**: Withdraw funds from organization wallet to accountant custody.
    - **Wallet Movement Ledger Modal**: Full drill-down of all transactions in a specific wallet.

---

## 3. Verification Plan

- Run `npm run typecheck --prefix backend` $\rightarrow$ 0 errors.
- Run `npm run build --prefix frontend` $\rightarrow$ 0 errors.
- Run `npx tsx src/scripts/test-reinvestments.ts` verifying wallet balance derivation, reinvestment execution, blended top-up deduction, and wallet-to-bank liquidation.
- Create walkthrough: `docs/Walkthrough- Issue #9 — Reinvestment & Project Wallet (Full-Stack).md`.
