# Walkthrough — Issue #22: Optional Payment Receipt OCR Auto-Extraction Workflow (Full-Stack)

## Overview

Issue #22 implements an end-to-end, optional **Payment Receipt OCR and Auto-Extraction Workflow** for the NS Foundation Cooperative Society web application. 

The workflow enables accountants to upload payment screenshots, digital slips, and bank deposit counterfoils (JPEG, PNG, WEBP, and PDF) up to 10 MB per file. The system automatically extracts financial fields (amount, date, transaction ID/TrxID, gateway, sender phone, reference), identifies candidate member and custody accounts with confidence scoring, and flags suspected duplicates.

**Crucial Integrity Constraint**:
- OCR and candidate matching **never post transactions to financial ledgers autonomously**.
- An accountant review step is mandatory. The verified details are posted through the authoritative `PaymentService.recordPayment` method, preserving financial atomicity, allocation mechanics, and idempotency guarantees. Manual payment entry remains 100% operational and intact.

---

## Key Components Implemented

### 1. Data Models & Type System
- **`backend/src/types/receipt.ts`**:
  - `ReceiptGateway`: `BKASH`, `NAGAD`, `BANK`, `UNKNOWN`.
  - `ReceiptStatus`: `RECEIPT_UPLOADED`, `PROCESSING`, `EXTRACTED`, `NEEDS_REVIEW`, `READY_TO_POST`, `POSTED`, `OCR_FAILED`, `MATCH_FAILED`, `DUPLICATE_SUSPECTED`.
  - `ExtractedReceiptData`: Captures amounts, dates, TrxIDs, phone numbers, references, raw text, and confidence scores (0–100).
  - `MemberMatchResult` & `CustodyMatchResult`: Strategy (`EXACT_ID`, `EXACT_PHONE`, `EXACT_NAME`) and ranked candidate array with confidence scores.
  - `DuplicateCheckResult`: Exact SHA-256 file matches, Transaction ID matches, and composite suspect detection.
- **`backend/src/models/PaymentReceipt.ts`**:
  - Mongoose schema with immutable audit fields, indexing on `sha256`, `status`, `extractedData.transactionId`, and `paymentId`.
  - Stores field-level accountant corrections in an append-only `corrections` array.

### 2. Private Protected File Storage
- **`backend/src/services/ocr/storage/receipt-storage.service.ts`**:
  - Files are stored in private filesystem paths partitioned by date: `output/receipts/YYYY/MM/<uuid>.<ext>`.
  - Files are never exposed via public static URLs.
  - Streaming endpoint (`GET /api/payments/receipts/:id/file`) requires authentication and role verification (`ADMIN`, `SUPER_ADMIN`, `ACCOUNTANT`).
  - Automatically computes and indexes SHA-256 hashes during upload.

### 3. Heuristic Regex Parser & OCR Engine
- **`backend/src/services/ocr/providers/heuristic-regex-parser.ts`**:
  - `convertBengaliDigits`: Converts Bengali numerals (`০-৯`) to standard Arabic ASCII numerals (`0-9`).
  - Specialized regex patterns for:
    - **bKash**: TrxID format (alphanumeric 8–10 chars), BDT amounts, fee charges, and 11-digit phone numbers.
    - **Nagad**: TxnID format, BDT/Tk amounts, and sender numbers.
    - **Bank Counterfoils**: Bank deposit slips, CellFin references, account numbers, and formatted dates.
- **`backend/src/services/ocr/providers/default-ocr.provider.ts`**:
  - `IOcrProvider` interface and `DefaultOcrProvider` (pluggable architecture ready for Google Cloud Vision, Tesseract, or AWS Textract).

### 4. Candidate Matching & Duplicate Detection Engine
- **`backend/src/services/ocr/receipt-matching.service.ts`**:
  - Matches active members via 3 cascaded strategies:
    1. Exact Member ID found in receipt reference or text (Score: 100)
    2. Exact 11-digit phone number match (Score: 95)
    3. Member name token match in raw text (Score: 80)
  - Matches custody accounts based on detected gateway (`BKASH`, `NAGAD`, `BANK`) and account numbers.
  - **Duplicate Detection**:
    - **SHA-256 Exact Match**: Catches identical uploaded image files.
    - **Transaction ID Match**: Catches TrxIDs already present in receipts or posted payments.
    - **Composite Suspect Match**: Flags matching amount, date, and sender.

### 5. Authoritative Posting Lifecycle
- **`backend/src/services/ocr/receipt.service.ts`**:
  - `uploadReceipt`: Saves private file, computes SHA-256, extracts fields, matches candidates, and detects duplicates.
  - `reviewReceipt`: Persists accountant corrections with field audit history.
  - `calculateReceiptAllocationPreview`: Simulates authoritative allocation (principal, advance, penalty, gateway fee) without committing changes.
  - `overrideDuplicate`: Requires authorized accountant justification to clear `DUPLICATE_SUSPECTED` receipts.
  - `postPaymentFromReceipt`: Calls authoritative `PaymentService.recordPayment`, atomically updates `CustodyAccount.cachedBalance`, generates `MonthlyLedger` allocations, and links `paymentId`.

### 6. REST API Endpoints & Routes
- **`backend/src/routes/receipt.routes.ts` & `backend/src/controllers/receipt.controller.ts`**:
  - `POST /api/payments/receipts`: Multi-file upload (up to 10 files, 10MB limit).
  - `GET /api/payments/receipts`: Paginated queue with status and gateway filtering.
  - `GET /api/payments/receipts/:id`: Detailed receipt metadata and candidate list.
  - `GET /api/payments/receipts/:id/file`: Stream original file (protected).
  - `PATCH /api/payments/receipts/:id/review`: Save accountant edits.
  - `POST /api/payments/receipts/:id/preview`: Preview financial allocation.
  - `POST /api/payments/receipts/:id/override`: Authorize duplicate override.
  - `POST /api/payments/receipts/:id/post`: Confirm and post to ledger.
- Mounted at `/api/payments/receipts` in `backend/src/app.ts` prior to `/api/payments` to avoid route collisions.

### 7. Frontend User Interface
- **`frontend/src/components/ReceiptOcrManager.tsx`**:
  - Drag-and-drop receipt upload dropzone with immediate progress state.
  - Status queue filtering (`ALL`, `NEEDS_REVIEW`, `READY_TO_POST`, `DUPLICATE_SUSPECTED`, `POSTED`).
  - Split-view review modal:
    - **Left**: Protected file viewer (Image preview & PDF iframe) with raw OCR snippet viewer.
    - **Right**: Editable verification form with live candidate badges, searchable member & custody selectors, live allocation breakdown, and suspected duplicate override warning.
- **`frontend/src/pages/PaymentsPage.tsx`**:
  - Added "Upload Receipt (OCR)" action button next to "Collect Payment".
  - Added dedicated "Receipt OCR Queue" tab with real-time refresh and integration into payment voucher printing.
- **`frontend/src/i18n/translations.ts`**:
  - Complete English and Bengali translations for all OCR terms.
- **`frontend/src/services/api.ts`**:
  - Enhanced `apiRequest` to support `FormData` multipart payloads seamlessly.

---

## Verification & Test Results

### 1. Automated Vitest Test Suite (`backend/src/tests/receipt-ocr.test.ts`)
The new test suite covers 10 comprehensive tests across all OCR lifecycle components:
1. Bengali numeral normalization (`১২,৫০০.৫০` → `12,500.50`)
2. bKash TrxID, amount, date, and sender extraction
3. Nagad TxnID and amount extraction
4. Unstructured text fallback and low-confidence scoring
5. Receipt private storage, SHA-256 hashing, and stream retrieval
6. Candidate member and custody matching
7. SHA-256 duplicate file detection
8. End-to-end receipt upload to `NEEDS_REVIEW` queue
9. Accountant review and allocation preview calculation
10. Final payment posting to financial ledger and duplicate posting prevention

### 2. Full Test Suite Execution
```
 RUN  v2.1.9 C:/TechVelly/NSFoundationWebApp/backend

 ✓ src/tests/security-baseline.test.ts (3 tests)
 ✓ src/tests/financial-allocations.test.ts (4 tests)
 ✓ src/tests/receipt-ocr.test.ts (10 tests)
 ✓ src/tests/jobs.test.ts (9 tests)

 Test Files  4 passed (4)
      Tests  26 passed (26)
   Duration  10.04s
```

### 3. Frontend & Backend Typecheck Verification
- **Backend Typecheck (`npm run typecheck`)**: Exited with code 0.
- **Frontend Production Build (`npm run build`)**: Vite bundle succeeded in 8.06s with code 0.
