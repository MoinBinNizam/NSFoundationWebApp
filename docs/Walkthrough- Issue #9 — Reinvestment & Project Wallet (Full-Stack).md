# Walkthrough: Issue #9 — Reinvestment & Project Wallet (Full-Stack Complete)

Implemented the dedicated **Reinvestment & Project Wallet Module** for **GitHub Issue #9**, following SRS Sections 16.3, 20–22, the financial-separation rules, and the serial issue roadmap.

---

## 1. Business Rules Implemented

1. **External wallets are segregated custody**
   - Partner wallets use `CustodyAccount` with `accountType: EXTERNAL_WALLET` and `channel: WALLET`.
   - Their balance is derived from the immutable movement ledger (`IN − OUT`). It is shown separately from accountant-held money and does not increase personal custody balances.
2. **Blended reinvestment is correctly split**
   - The wallet portion creates one `OUT / INVESTMENT_FUNDING` movement from the external wallet.
   - Optional fresh money creates a separate `OUT / INVESTMENT_FUNDING` movement only from the selected `ACCOUNTANT_CUSTODY` account.
   - Each portion creates its own `InvestmentFunding` record for the destination project, while a single immutable `Reinvestment` record links the source project, wallet, destination project, date, and approval.
3. **Wallet liquidation is an internal transfer, not income**
   - Cashing out a wallet to an accountant account uses the existing linked `FundTransfer` mechanism: `OUT / INTERNAL_TRANSFER` from the wallet and `IN / INTERNAL_TRANSFER` to accountant custody.
   - No expense, income, or artificial profit event is produced.
4. **Lineage is traceable**
   - Each event shows `source project → organization wallet → destination project`, its wallet amount, fresh top-up (if any), approver, date, and notes.

---

## 2. Backend Implementation

### Dedicated API surface

Added [`backend/src/services/reinvestment.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/reinvestment.service.ts), [`reinvestment.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/reinvestment.controller.ts), and [`reinvestment.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/reinvestment.routes.ts).

The routes are mounted from [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts) at `/api/reinvestments` and are authenticated. Reinvestment and liquidation writes additionally require a primary or assistant accountant.

| Endpoint | Purpose |
|---|---|
| `GET /api/reinvestments/stats` | Wallet holdings, reinvested proceeds, liquidations, and chain count |
| `GET /api/reinvestments/wallets` | Live external-wallet cards with ledger-derived totals |
| `GET /api/reinvestments/wallets/:id/ledger` | Searchable, paginated wallet movement ledger |
| `GET /api/reinvestments/chains` | Reinvestment lineage/audit events; optionally filter by `projectId` |
| `POST /api/reinvestments/execute` | Validated wallet or blended reinvestment |
| `POST /api/reinvestments/liquidate` | Wallet-to-accountant internal transfer |

The service validates wallet type/channel, active accounts, positive amounts, non-identical source/destination projects, valid target project state, and live derived balances before recording any financial movements. It also updates cached balance projections and writes dedicated audit records.

The existing Issue #8 `/api/investments/reinvest` operation remains available for backward compatibility; Issue #9 provides the focused operational APIs and interface.

### Integration test

Added [`backend/src/scripts/test-reinvestments.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/test-reinvestments.ts) and the command:

```bash
npm run test:reinvestments --prefix backend
```

The integration test creates a uniquely named source/destination pair, records a ৳1,200 maturity return into an external wallet, verifies a ৳1,000 wallet + ৳200 accountant blended reinvestment, liquidates the ৳200 residual wallet balance, and confirms both lineage and linked transfer movements. It writes test ledger data, so run it only against a development database.

---

## 3. Frontend Implementation

Added [`frontend/src/pages/ReinvestmentsPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/ReinvestmentsPage.tsx), mounted as `/reinvestments` in [`frontend/src/App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx), and enabled **Project Wallets** in [`frontend/src/components/Layout.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx).

The new responsive screen includes:

- Four summary cards: organization-wallet holdings, reinvested proceeds, liquidations to accountants, and active capital chains.
- Partner-wallet cards with live balance, proceeds/reinvestment/liquidation totals, drill-down ledger, and role-gated actions.
- A reinvestment form with a source project, destination project, wallet amount, optional accountant top-up, date, and notes.
- A liquidation form that sends wallet funds to an accountant custody account.
- Lineage and audit tabs that show each capital path and its approval evidence.

---

## 4. Verification

- `npm run typecheck --prefix backend` — passed with zero TypeScript errors.
- `npm run build --prefix frontend` — passed; the production bundle includes the `/reinvestments` route and page.
- The dedicated database integration test is included but intentionally not run here, because it writes test projects, wallet movements, and transfers to the configured MongoDB database.

## 5. Operational Flow

```text
Matured project return
        │  IN / INVESTMENT_RETURN
        ▼
External partner wallet (segregated)
        ├── OUT / INVESTMENT_FUNDING ──► New investment project
        │          + optional OUT from accountant custody
        └── OUT / INTERNAL_TRANSFER ──► IN to accountant custody
```
