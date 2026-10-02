# Walkthrough — Issue #29: DB Reset, CSV Seeding, Board Designations & Dynamic RBAC

## Delivered outcome

Issue #29 now provides a repeatable clean database reset, CSV-driven member seeding, Board designation management, and a dynamic module-access matrix that is enforced in both the API and the application navigation.

## Database reset and member import

Run the following from the repository root when a clean development dataset is needed:

```powershell
npm run reset-and-seed --prefix backend
```

The command removes all documents from the configured development database and then imports `docs/Updated-NS FOUNDATION 2024 - Sorted Members.csv`.

- Creates exactly 33 members, from `NSF001` through `NSF033`.
- Preserves the source phone numbers and join dates.
- Removes Board suffixes from display names and stores their designation separately.
- Creates one initial share-history event per member using the CSV share count.
- Seeds the live `MONTHLY_SHARE_VALUE` configuration at 500.
- Creates the seven documented staff/demo accounts and four active custody accounts at ৳0.00. It never creates opening balances, payments, or any other financial movements.

If an older local development database contains the former known demo receipts (`RCP-202401-0001` or `RCP-202401-0002`) and opening adjustments, remove only those records with:

```powershell
$env:REMOVE_DEMO_FINANCIAL_DATA='YES'
npm run remove-demo-financial-data --prefix backend
```

The command recalculates custody balances after removal. It will not run without the explicit confirmation variable.

## Board designations

The member and user models support these designations:

- Director
- President
- Accountant
- Assistant Accountant
- General Secretary
- Convener
- General Member

Administrators can select a designation in both the Add Member and Edit Member forms. The member list and member detail panel show the designation as a badge. Updating a member designation also updates a linked user account, so permissions follow the board assignment.

## Dynamic module access

The Super Admin can open **Organization Settings → Module Access & RBAC Permissions Matrix** to set View and Edit permissions for each designation or base role. Editing a permission automatically enables viewing; removing view access also removes edit access.

The matrix covers all application modules: Dashboard, Statements, Members, Shares, Payments, Custody, Investments, Project Wallets, Expenses, Reports, Governance, Settings, Audit, Migration, and Distribution.

Default Director permissions are view-only for Members, Payments, and Custody. Unlike the earlier incomplete implementation, that is a seeded policy rather than an unchangeable UI or middleware exception: a Super Admin can deliberately change it from the matrix. Super Admin access itself remains permanently unrestricted.

The same effective permissions are used for sidebar visibility and API enforcement. Share, investment, custody, payment, member, and expense operations now apply module-level checks in addition to their existing financial-role safeguards.

## Verification completed

After the final seed, database verification confirmed:

- 33 members
- 33 initial share-history records
- 7 board/staff/demo users
- 10 default permission documents
- `MONTHLY_SHARE_VALUE` configured to 500
- four active custody accounts at ৳0.00 with no financial movements

The following checks passed:

```powershell
npm run typecheck --prefix backend
npm test --prefix backend
npm run build --prefix frontend
```

The regression suite completed with 9 test files and 47 tests passing.

## Detailed commit message

```text
feat(rbac): seed board designations and enforce dynamic module access

- add Board designation fields to Member and User records and expose them in
  member creation, editing, badges, auth responses, and linked-user sync
- add a ModulePermission model, effective-permission API, and Super Admin
  permission matrix for all application modules and supported roles
- enforce dynamic access in member, payment, custody, share, investment, and
  expense routes while retaining existing financial authority controls
- make sidebar visibility and read-only UI state use the same effective module
  permissions returned by the backend
- replace hard-coded Director restrictions with seeded defaults that the Super
  Admin can intentionally update through the RBAC matrix
- add a repeatable reset-and-seed command that imports the 33-member CSV,
  creates initial share history, board/demo accounts, zero-balance custody accounts,
  financial defaults, and permission matrices
- use the live MONTHLY_SHARE_VALUE configuration key during seeding
- verify backend type-checking, full regression tests, frontend production
  build, and the freshly seeded database state
```
