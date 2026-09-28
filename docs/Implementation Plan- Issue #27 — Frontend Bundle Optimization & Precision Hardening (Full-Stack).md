# Implementation Plan — Issue #27: Frontend Bundle Optimization & Precision Hardening (Full-Stack)

## Goal

Optimize frontend initial load performance through route-based code-splitting and eliminate IEEE 754 floating-point rounding risks by establishing a rigorous monetary calculation and storage standard across all financial ledger operations.

---

## Scope

- **Frontend Bundle Splitting:**
  - Convert static page imports in `frontend/src/App.tsx` to dynamic `React.lazy()` imports wrapped in a smooth `Suspense` fallback.
  - Configure Rollup manual chunking in `frontend/vite.config.ts` to separate large third-party libraries (Lucide React, React DOM, router).
  - Reduce initial page bundle size from >630 KB uncompressed to <150 KB gzip.
- **Financial Precision Standard:**
  - Create a dedicated precision arithmetic utility (`backend/src/utils/money.ts`).
  - Standardize all currency handling to prevent floating-point inaccuracies (e.g., `0.1 + 0.2 !== 0.3`) across fractional gateway cash-out fees (e.g. 7.45 BDT), penalty rates, and final distribution dividend splits.
  - Provide database migration or schema validation ensuring consistent rounding rules across all monetary fields.

---

## Detailed Implementation Tasks

### 1. Frontend Code-Splitting & Lazy Loading
- Update `frontend/src/App.tsx`:
  - Replace static page imports with:
    ```tsx
    const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
    const PaymentsPage = React.lazy(() => import('./pages/PaymentsPage').then(m => ({ default: m.PaymentsPage })));
    const CustodyPage = React.lazy(() => import('./pages/CustodyPage').then(m => ({ default: m.CustodyPage })));
    const InvestmentsPage = React.lazy(() => import('./pages/InvestmentsPage').then(m => ({ default: m.InvestmentsPage })));
    // ... all other pages
    ```
  - Wrap the route outlets in a responsive loading skeleton/spinner component.
- Configure `frontend/vite.config.ts`:
  ```ts
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 400,
  }
  ```

### 2. High-Precision Monetary Utility (`backend/src/utils/money.ts`)
- Implement deterministic math functions:
  ```ts
  /** Converts BDT amount to integer paisa (1 BDT = 100 paisa) */
  export function toPaisa(amount: number): number {
    return Math.round(amount * 100);
  }

  /** Converts integer paisa to formatted BDT with exact 2 decimal places */
  export function toBDT(paisa: number): number {
    return paisa / 100;
  }

  /** Safe addition of monetary values without float drift */
  export function addMoney(a: number, b: number): number {
    return (Math.round(a * 100) + Math.round(b * 100)) / 100;
  }

  /** Safe subtraction of monetary values */
  export function subtractMoney(a: number, b: number): number {
    return (Math.round(a * 100) - Math.round(b * 100)) / 100;
  }

  /** Multiplies an amount by a percentage/fee rate and applies explicit rounding */
  export function multiplyMoney(amount: number, rate: number, roundNearestInteger: boolean = false): number {
    const raw = (amount * rate);
    return roundNearestInteger ? Math.round(raw) : Math.round(raw * 100) / 100;
  }
  ```
- Refactor `PaymentService.ts`, `CustodyService.ts`, and `DistributionService.ts` to utilize these precision helpers for all balance derivations, arrears allocations, gateway fee roll-overs, and dividend splits.

---

## Acceptance Criteria

- Running `npm run build --prefix frontend` produces code-split chunks with no single bundle exceeding 400 KB uncompressed.
- Initial page load time on slow 3G network profiles drops by at least 50%.
- Cumulative ledger calculations across 10,000 transactions produce zero floating-point drift or fractional paisa discrepancies.
