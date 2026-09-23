# Walkthrough — Issue #19: Annual Closing, Policy & Member Exit Governance

## Annual governance

1. Admin or Super Admin opens **Annual Governance** from the sidebar.
2. Create an annual-closing draft for a selected year. The system snapshots collections, principal, penalties, cash-out charges, expenses, returns, profit/loss, dues, advances, custody, and member totals.
3. An Admin may review a draft. Only Super Admin may approve and lock it.
4. Each lifecycle action is audit logged and protected by an Issue #18 idempotency key.

## Policy management

1. Super Admin can add formal items under **এন এস ফাউন্ডেশন এর নীতিমালা**.
2. Every policy begins at version 1 and records its creator.
3. Amendments require a reason and create a new immutable policy version rather than overwriting history.
4. All authenticated users can read the current formal policy; creation and amendments remain Super Admin-only.

## Member exit settlement

1. An authorized Admin proposes an exit after confirming an eligible amount.
2. The server rejects members with less than one year of membership, unresolved monthly dues, cash-out charge due, or an existing settlement.
3. The proposal calculates the approved 9.99% deduction and divides the net amount across four monthly installments.
4. Only Super Admin can approve the settlement and release each installment from a funded custody account.
5. Each release creates an audited custody outflow. When all four installments are paid, the member moves to the dropped/settled state.

## Preserved organizational decision

The post-2024 transferred-share accumulated-entitlement rule remains pending organizational decision. Issue #19 does not calculate, assign, or infer that entitlement.

## Verification

- Backend TypeScript production build passed.
- New governance routes enforce server-side Admin/Super Admin permissions.
- Annual, policy, exit proposal, approval, and payout commands require Issue #18 idempotency protection.
