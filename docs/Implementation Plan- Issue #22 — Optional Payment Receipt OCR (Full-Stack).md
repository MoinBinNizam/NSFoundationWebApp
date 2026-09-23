# Implementation Plan — Issue #22: Optional Payment Receipt OCR

## Objective

Add an optional receipt-upload and OCR-assisted payment-entry workflow to Contributions & Payments. OCR may propose data, but it must never post, allocate, or alter financial records by itself. Manual payment entry remains fully available when OCR is disabled, unavailable, or inconclusive.

## Current project integration points

| Existing area | Current responsibility | Issue #22 integration |
| --- | --- | --- |
| `PaymentService.recordPayment` | Creates `Payment`, allocations, custody movement, ledger effects, and audit data | Sole final posting path for reviewed OCR drafts |
| `PaymentService.calculatePaymentPreview` | Calculates arrears/current/advance allocation | Used for the OCR-review allocation preview |
| `Payment`, `PaymentAllocation`, `CustodyMovement`, `MonthlyLedger` | Financial source-of-truth records | Remain unchanged as the accounting source of truth |
| `CustodyAccount` | Stores channel, holder and account number | Matches receipt receiver identity to a destination account |
| `Member` | Stores member ID, name and phone | Supplies deterministic matching candidates |
| `AuditLog` | Immutable operational audit trail | Records upload, extraction, corrections, overrides and final post |
| `PaymentsPage` | Manual collection, preview, ledger and printable receipts | Adds a separate OCR entry route/tab without replacing manual collection |
| `apiRequest` | JSON-first authenticated API client | Needs a multipart helper for upload endpoints; existing helper remains for JSON review/post actions |

## Architecture

```text
Manual payment ───────────────────────────────────────────┐
                                                        ▼
Receipt upload → stored original → OCR provider → review draft
                                           │              │
                                           └── unavailable / failed → manual correction
                                                                       │
                                                   PaymentService preview
                                                                       │
                                                    accountant confirms review
                                                                       │
                                                        PaymentService.recordPayment
                                                                       │
              Payment → PaymentAllocation → CustodyMovement → MonthlyLedger → AuditLog
```

`PaymentReceipt` is an evidence-and-workflow record. `Payment` is a posted accounting transaction. The first may exist without the second; a posted payment can have one or more linked receipt records.

## Scope and constraints

- Supported uploads: JPG, JPEG, PNG, WEBP and PDF, with server-side MIME sniffing and size/page limits.
- Single and batch uploads are supported; each uploaded file has an independent lifecycle.
- OCR is provider-optional and provider-replaceable. No provider key is stored in source control.
- Uncertain member/custody matches never auto-post.
- The existing manual payment form, payment IDs, 2024 reconciliation policy, 2025 share lock and allocation rules are out of scope.
- Original files are private. Storage URLs are never public or returned as permanent public links.

## Data model

### New `PaymentReceipt` model

Create `backend/src/models/PaymentReceipt.ts` and export it through `models/index.ts`.

Core fields:

- `_id`, `paymentId?`, `batchId?`, `uploadedBy`, `uploadedAt`, `processedAt?`, `reviewedAt?`, `reviewedBy?`
- `originalFilename`, `storageKey`, `mimeType`, `byteSize`, `sha256`, optional `pageCount`
- `gateway`: `BKASH | NAGAD | BANK | UNKNOWN`
- `status`: `RECEIPT_UPLOADED | PROCESSING | EXTRACTED | NEEDS_REVIEW | READY_TO_POST | POSTED | OCR_FAILED | MATCH_FAILED | DUPLICATE_SUSPECTED`
- `extractedData`: immutable provider output with nullable member ID/name, sender, receiver, amount, date, transaction ID, reference, fee, raw text, fields/confidences and provider metadata
- `reviewedData`: accountant-edited working values, never used until explicit post
- `memberMatch`: selected member, candidates, match strategy and confidence
- `custodyMatch`: selected custody account, candidates, match strategy and confidence
- `duplicateCheck`: matched receipt/payment IDs, match factors, score, status and explicit override metadata
- `corrections`: append-only field-level original/revised values, actor and timestamp
- `error`: safe processing error code/message; no provider secrets or raw stack traces

Indexes:

- `{ sha256: 1 }` for exact duplicate upload detection
- `{ status: 1, createdAt: -1 }` for review queues
- `{ paymentId: 1 }`, `{ uploadedBy: 1, createdAt: -1 }`
- sparse `{ 'extractedData.transactionId': 1, gateway: 1 }` for transaction duplicate signals

### Optional `ReceiptBatch` model

Create only if batch-level naming, totals, lifecycle and audit retrieval are needed. Otherwise use a generated `batchId` on `PaymentReceipt` and return a batch response DTO. The initial implementation should prefer the latter to keep the schema minimal.

### Existing models

Do not add extracted fields to `Payment` as its source of truth. Add only an optional receipt linkage strategy if necessary:

- preferred: `PaymentReceipt.paymentId` owns the relationship;
- optional later: a denormalized receipt count/IDs in `Payment` for list performance.

## Storage design

Introduce a small storage abstraction:

```ts
interface ReceiptStorageProvider {
  put(input: { stream: Readable; key: string; contentType: string }): Promise<void>;
  getReadStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
```

Initial provider: private local filesystem root from `RECEIPT_STORAGE_DIR`, with generated keys like `receipts/YYYY/MM/<uuid>.<ext>`. Production provider: an S3-compatible adapter using the same contract. Never save document bytes in MongoDB.

Validate server-side before storage:

- allowlisted MIME and file signature,
- configurable maximum file size and batch count,
- PDF page-count cap,
- SHA-256 generated while streaming,
- collision-safe UUID key, original filename retained only as metadata.

## OCR abstraction

Create `backend/src/services/ocr/`:

- `types.ts`: normalized extraction result, field confidence, provider error types
- `ocr-provider.ts`: provider interface
- `disabled-ocr-provider.ts`: explicit `OCR_DISABLED` result, not an exception
- `google-vision-provider.ts` or equivalent selected provider adapter
- `receipt-extraction.service.ts`: invokes the provider, normalizes data, persists immutable extraction result and derives review state

Environment configuration:

- `OCR_ENABLED=false`
- `OCR_PROVIDER=disabled|google-vision|azure-document-intelligence|textract`
- provider credentials/location/model variables specific to the chosen adapter
- `RECEIPT_STORAGE_PROVIDER=local|s3`
- `RECEIPT_STORAGE_DIR`, limits and retention values

Provider selection is an implementation decision before coding. For the first deployment, choose one managed provider only and keep its SDK behind the interface. PDF handling must use the provider's asynchronous/document endpoint where required; no unbounded local PDF/raster processing.

## Matching and validation services

### Member matching

Create `receipt-matching.service.ts` with deterministic, explainable scoring:

1. exact registered identifier or member ID;
2. exact normalized phone/account identifier;
3. normalized exact name;
4. conservative token/name candidate list;
5. no automatic selection for ties or low confidence.

Persist candidate IDs, score and strategy. Name matching is only a suggestion. Do not infer a member from payment amount or historical arrears.

### Custody matching

Match a normalized extracted receiver identifier against `CustodyAccount.accountNumber` and channel. Require a unique candidate for automatic selection. Do not hardcode accountant names or gateway destinations.

### Duplicate detection

Implement a scored, explainable check:

- exact receipt SHA-256: hard duplicate signal;
- same transaction/reference + gateway: high signal;
- same member, amount, date, gateway and receiver: suspect signal;
- preserve all factors and related IDs.

`DUPLICATE_SUSPECTED` blocks posting until an authorized accountant explicitly supplies an override reason. Exact file duplicates should remain blocked unless a privileged policy explicitly allows bypass.

## API design

Add a dedicated authenticated `receipt` route family mounted below payments, before `/:id` to avoid route conflicts.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /api/payments/receipts` | Primary/Assistant accountant | Multipart single/batch upload; stores files and creates workflow records |
| `GET /api/payments/receipts` | Authorized staff | Paginated receipt/review queue with status filters |
| `GET /api/payments/receipts/:id` | Authorized staff | Receipt metadata, extraction, candidates, corrections and post result |
| `GET /api/payments/receipts/:id/file` | Authorized staff | Streams protected original file after authorization |
| `POST /api/payments/receipts/:id/process` | Primary/Assistant accountant | Starts/retries extraction if policy permits |
| `PATCH /api/payments/receipts/:id/review` | Primary/Assistant accountant | Validates corrected fields, member/custody selections and recalculates matches/duplicates |
| `POST /api/payments/receipts/:id/preview` | Primary/Assistant accountant | Calls existing `calculatePaymentPreview` using reviewed data |
| `POST /api/payments/receipts/:id/post` | Primary/Assistant accountant + idempotency | Revalidates review state, invokes `recordPayment`, links receipt and writes audit events |
| `POST /api/payments/receipts/:id/duplicate-override` | Admin/defined policy | Records a reasoned duplicate override; never posts automatically |

Controllers remain thin. Multipart parsing occurs before `sanitizeRequest` only on upload routes; validate text fields separately and route no file metadata from untrusted client fields into storage keys.

## Posting transaction and failure policy

1. Lock/reload receipt and require a postable review state.
2. Re-run duplicate detection and require fresh explicit override where applicable.
3. Derive `receiverId` from the selected custody account holder; do not trust an OCR receiver name.
4. Call `PaymentService.recordPayment` with accountant-reviewed `memberId`, `custodyAccountId`, date, amount, method, fee and transaction reference.
5. Link returned payment ID to receipt and set `POSTED` only after successful financial posting.
6. Write audit events with receipt ID and payment ID.

Use a MongoDB session/transaction if the existing payment service can be made session-aware. Otherwise retain a recoverable `POSTING` state and idempotency key so a retry cannot create two payments. This decision must be resolved before implementation; do not simply call post twice after a timeout.

## Frontend plan

Extend `PaymentsPage` with a clearly separate entry choice:

- **Manual collection** continues to open the current form unchanged.
- **Upload receipt / OCR** opens a workflow modal or an `OCR Receipts` sub-tab.

Components/state to add:

- `ReceiptUploadPanel`: drag/drop/file picker, allowlist, count/size feedback and batch progress;
- `ReceiptProcessingQueue`: status chips, retry/failure/manual-review actions;
- `ReceiptReviewForm`: editable member, custody, method, amount, date, fee and transaction reference; shows confidence and candidate explanation;
- `DuplicateWarning`: linked possible duplicates plus override reason control;
- `ReceiptAllocationPreview`: reuses the existing payment preview data shape;
- `ReceiptArchive`: protected original-file view/download only through authenticated endpoint.

Add `apiUpload` beside `apiRequest`, omitting the JSON `Content-Type` so `FormData` sets its boundary. Reuse `apiRequest` for all JSON review, preview and post calls. Do not put OCR provider secrets, raw service responses or permanent storage URLs in the frontend.

## Authorization and audit policy

- Primary and Assistant accountants may upload/review/post only through existing payment authority rules.
- Receipt file access follows payment-staff authorization and should be scoped further if multi-organization support is introduced.
- Admin-only duplicate override policy must be explicitly agreed before development.
- Audit: `RECEIPT_UPLOADED`, `OCR_PROCESS_STARTED`, `OCR_EXTRACTED`, `OCR_FAILED`, `RECEIPT_REVIEWED`, `RECEIPT_FIELD_CORRECTED`, `RECEIPT_MEMBER_ASSIGNED`, `RECEIPT_CUSTODY_ASSIGNED`, `RECEIPT_DUPLICATE_FLAGGED`, `RECEIPT_DUPLICATE_OVERRIDDEN`, `RECEIPT_POSTED`.
- Audit payloads store IDs and field deltas, not raw receipt image bytes or credentials.

## Phased delivery

### Phase 1 — foundations

1. Select OCR provider, storage provider and duplicate-override authority.
2. Add package dependencies only after selection (likely multipart parser plus storage/OCR SDK).
3. Add environment schema/example documentation and fail-safe disabled provider.
4. Add `PaymentReceipt`, indexes, storage abstraction and protected streaming.

### Phase 2 — extraction and review

1. Add upload, process, list/detail and status APIs.
2. Persist raw normalized extraction with confidence and safe errors.
3. Implement deterministic member/custody matching and duplicate detection.
4. Add correction history and review API.

### Phase 3 — accounting integration

1. Build OCR-review allocation preview using `PaymentService.calculatePaymentPreview`.
2. Add idempotent final post path using `PaymentService.recordPayment`.
3. Link receipt/payment and record audit events.
4. Cover retry/recovery behavior and duplicate overrides.

### Phase 4 — user experience and hardening

1. Add the separate OCR upload/review UI to Payments.
2. Add batch queue, accessible validation and Bangla localization.
3. Add protected file download/view and operational monitoring.
4. Document backup/retention and receipt storage capacity guidance.

## Tests and verification

Backend tests must cover:

1. accepted/rejected MIME and file signatures, size limits and private storage;
2. disabled OCR path and manual-review fallback;
3. extraction normalization with missing/null fields;
4. exact, ambiguous and no-match member/custody cases;
5. SHA/transaction/composite duplicate scenarios;
6. correction audit history and stale review rejection;
7. batch partial failure isolation;
8. allocation preview integration for arrears/current/advance;
9. idempotent post, receipt-payment link and audit events;
10. unauthorized metadata/file/post access.

Frontend checks must cover upload validation, status display, manual corrections, ambiguity selection, duplicate warnings and post confirmation. Use provider fixtures/mocks only—never real member financial files or provider keys.

Before delivery run backend/frontend type checks, production builds, configured tests, manual upload/review/post smoke tests, manual-only fallback, OCR failure, duplicate, batch and access-control verification.

## Documentation updates after implementation

Update `DATABASE-SCHEMA.md`, `API-SPECIFICATION.md`, `BUSINESS-RULES.md`, `SYSTEM-DEVELOPMENT-GUIDELINE.md` and `CHANGELOG.md` with the actual selected provider/storage implementation, lifecycle, protection model, limits, retention and recovery behavior. Do not document unimplemented provider claims.

## Decisions required before implementation

1. Which OCR provider is approved and what service account/billing environment will be used?
2. Which production storage is approved: S3-compatible object storage, Azure Blob, Google Cloud Storage, or private server filesystem?
3. What are the maximum file size, PDF page count, batch count and retention period?
4. Who can override a suspected duplicate: Admin only or both accountant roles with an audit reason?
5. Should OCR run synchronously for the initial small scale or via a durable queue/worker from day one?

## Expected file impact

Likely new: `PaymentReceipt` model, receipt/OCR/matching/storage services, receipt controller/routes, multipart middleware, frontend OCR receipt components and focused tests. Likely modified: model barrel, `app.ts`, payment routes/controller/service integration, `PaymentsPage`, API helper, type definitions, environment examples and the five architecture docs listed above.

No runtime code is changed by this plan.
