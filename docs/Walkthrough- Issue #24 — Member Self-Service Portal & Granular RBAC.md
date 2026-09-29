# Walkthrough — Issue #24: Member Self-Service Portal & Granular RBAC

## Member portal

Member accounts now have a dedicated **My Member Account** entry in the sidebar. The portal calls `GET /api/member-portal/me`, which resolves the linked member ID from the authenticated session rather than accepting a member ID from the browser.

It shows only the signed-in member's profile, current share count, due and advance figures, contribution history, monthly ledger entries, and personal annual statement download.

## Organization transparency controlled by administrators

The portal also shows a member-safe **NS Foundation today** section. Administrators can independently enable or disable each item in **Settings → Member organization-information access**:

- organization collections and operational expenses;
- active and matured project summaries;
- realized profit/loss and net realized profit;
- expected profit from active projects, clearly labelled as a projection; and
- downloads of locked annual profit-and-loss reports.

The API returns only aggregates and safe project summaries. It never exposes another Member's payment, any custody account, source-account funding, partner transaction detail, or audit trail. The locked annual-report download permission is checked again by the backend endpoint, so it cannot be bypassed with a direct URL. Audit packs remain Super Admin-only.

## Privacy enforcement

- A member cannot retrieve a different member's statement: `GET /api/documents/members/:memberId/statement.pdf` returns `403` unless `:memberId` is the caller's linked member record.
- MEMBER accounts cannot download organization annual reports or audit packs.
- The portal endpoint does not accept a target member identifier, preventing browser-side ID substitution.

## Investment Manager

`INVESTMENT_MANAGER` is now an application role. Its seeded access permits investment and project-wallet work while denying member management, contribution collection, custody, and system settings. Existing route-level financial-role checks remain in force.

## CSV seed verification

The database was reset from `docs/Updated-NS FOUNDATION 2024 - Sorted Members.csv` after the Issue #24 changes.

- 33 members imported from `NSF001` through `NSF033`
- 33 initial share-history entries created from CSV share counts
- Board designations derived from CSV name suffixes and stored separately
- 7 linked board/staff/demo accounts created
- 11 module-permission matrices seeded, including `INVESTMENT_MANAGER`

The source CSV member IDs are `NSF001`–`NSF033`; no `NS-GOV-*` records are seeded.

## Validation

```powershell
npm run typecheck --prefix backend
npm test --prefix backend
npm run build --prefix frontend
npm run reset-and-seed --prefix backend
```

Backend type-checking and all 47 regression tests passed. The frontend production build passed.

## Commit message

```text
feat(member-portal): add self-service profile and scoped investment role

- add authenticated member portal exposing only the caller's shares, dues,
  advances, payments, monthly ledger, and annual statement
- prevent MEMBER accounts from downloading another member's statement or
  organization annual/audit documents
- add INVESTMENT_MANAGER role with investment and project-wallet permissions
- seed the investment manager permission matrix during database reset
- reset and verify the CSV-backed 33-member dataset and Board designations
- validate backend types, full regression tests, and frontend production build
```
