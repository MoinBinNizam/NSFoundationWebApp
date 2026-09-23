Yes. This is feasible, and given your finalized NS Foundation architecture, I would implement it as an **optional Receipt/OCR layer on top of the existing Contributions & Payments workflow**, not as a replacement for the payment engine.
   My requirement is- The accountant can choose- whether to enter payment manually or upload receipt for OCR extraction. If OCR fails to extract the data, the accountant can enter the data manually. If OCR successfully extracts the data, and insert the data in the right input fields, the accountant should review and correct if necessary before final posting. OCR should be optional.
   OCR extraction can be done through API Integration with any OCR service (such as Google Vision API, Amazon Textract, or Azure Form Recognizer). No need to build OCR from scratch. 
   
The key architectural principle should be:

> **OCR extracts data; the accounting/business engine decides how that payment is posted.**

That prevents an OCR mistake from directly corrupting member dues, penalties, advances, or accountant balances.

---

# 1. Finalized OCR Payment Workflow

The system should support **two payment-entry methods**:

### Method A — Normal/manual entry

```text
Accountant
   ↓
Contributions & Payments
   ↓
Select Member
   ↓
Enter Payment Details
   ↓
Payment Allocation Engine
   ↓
Save
```

### Method B — Receipt/OCR entry — Optional

```text
Accountant
   ↓
Upload Receipt(s)
   ↓
OCR / Document Extraction
   ↓
Extract:
  Member
  Gateway
  Sender
  Receiver
  Amount
  Date
  Transaction ID
  Fee
   ↓
Validate
   ↓
Match Member
   ↓
Match Accountant/Custody Account
   ↓
Calculate Dues
   ↓
Allocate Payment
   ↓
Accountant Review
   ↓
Correct if necessary
   ↓
Confirm & Post
   ↓
Payment + Allocations + Custody Movement + Receipt Archive
```

The accountant must **always be able to edit OCR results before final posting**.

---

# 2. Receipt Types

The feature should support:

* bKash receipts
* Nagad receipts
* Bank payment receipts
* JPG/JPEG
* PNG
* WEBP if practical
* PDF

It should support both:

### Single receipt

```text
Upload 1 receipt
```

and:

### Batch upload

```text
Upload 10 receipts
Upload 25 receipts
Upload mixed receipts
```

For example:

```text
Batch #2026-09
├── Member-A-bKash.jpg
├── Member-B-Nagad.pdf
├── Member-C-Bank.pdf
├── Member-D-bKash.jpg
└── Member-E-Nagad.jpg
```

The system processes each document independently and displays its extraction result.

---

# 3. Important: OCR Does Not Need to Be Enabled

Because you specifically want OCR optional, the architecture should have:

```text
Payment Entry
├── Manual Entry
└── Receipt/OCR Entry
```

If OCR is unavailable, disabled, reaches an API limit, or fails:

> **The Contributions & Payments module must continue working normally.**

The system must never make the entire payment module dependent on OCR.

---

# 4. What the OCR should extract

The extraction schema should support at least:

| Field            | Example     |
| ---------------- | ----------- |
| Member name      | Md. Rahim   |
| Member ID        | NSF012      |
| Gateway          | bKash       |
| Sender account   | 01XXXXXXXXX |
| Receiver account | 01YYYYYYYYY |
| Amount           | ৳3,060      |
| Payment date     | 2026-09-15  |
| Transaction ID   | ABC123XYZ   |
| Gateway fee      | ৳15         |
| Reference number | XYZ123      |
| Receipt type     | Image/PDF   |
| OCR confidence   | 96%         |

Not every receipt will contain every field.

Therefore:

```text
transactionId = optional
sender = optional
receiver = optional
fee = optional
memberId = possibly inferred
```

The system must **never invent missing values**.

---

# 5. Member Detection

The system should attempt:

```text
Receipt
 ↓
Sender / account identifier
 ↓
Registered member identifier
 ↓
Member match
```

If that is unavailable:

```text
Receipt name
 ↓
Name matching
 ↓
Candidate members
```

For example:

> Possible member: `NSF017 — Md. Abdul Karim`

Then the accountant can confirm/change it.

### Important

If OCR finds:

```text
Name = Md. Karim
```

but there are three members with similar names, the system should **not automatically post the payment**.

It should say:

> Multiple possible members found. Please select the correct member.

---

# 6. Accountant/Custody Account Detection

This is slightly different from member detection.

Suppose receipt says:

```text
To: 01XXXXXXXXXX
```

and that number belongs to:

```text
Moin bKash
```

The system maps:

```text
Receipt receiver
      ↓
CustodyAccount
      ↓
Moin / PRIMARY ACCOUNTANT
```

Likewise:

```text
Samrat Nagad
```

would map to Samrat's custody account.

This fits your existing:

```text
CustodyAccount
CustodyMovement
FundTransfer
```

architecture.

---

# 7. Payment Reconciliation

Suppose the system determines:

```text
Member: NSF003
Payment: ৳3,060
Date: 2026-06-15
```

It then queries the member's obligations.

Example:

```text
March 2026
Share: 2
Principal: ৳1,000
Penalty: ৳40

April 2026
Share: 2
Principal: ৳1,000
Penalty: ৳40

May 2026
Share: 1
Principal: ৳500
Penalty: ৳40
```

The Payment Allocation Engine determines exactly how the payment is distributed.

The final UI might show:

```text
Payment: ৳3,060

Allocation
────────────────────────
March       Principal   ৳1,000
March       Penalty        ৳40

April       Principal   ৳1,000
April       Penalty        ৳40

May         Principal     ৳500
May         Penalty        ৳40

Other/Advance/Charge     ...
────────────────────────
Total                     ৳3,060
```

The exact allocation algorithm must come from the approved NS Foundation business rules, not from the OCR service.

---

# 8. Arrears and Advance

The system must explicitly distinguish:

### Previous arrears

```text
2026-03 → PAID
2026-04 → PAID
2026-05 → PAID
```

### Current month

```text
2026-09 → PAID
```

### Advance

```text
2026-10 → ADVANCE
2026-11 → ADVANCE
```

So the accountant can see exactly:

> "This ৳5,000 payment settled March–September and left ৳1,000 as advance."

No vague `payment = 5000` record should be sufficient.

---

# 9. Receipt Storage

The original receipt should be preserved.

I would **not store the actual image/PDF binary directly inside MongoDB** unless there is a specific reason.

Instead:

```text
MongoDB
   ↓
Receipt metadata
   +
Storage URL / object key
```

The actual file goes into file/object storage.

For example:

```text
storage/
  receipts/
    2026/
      09/
        PAY-000123.jpg
        PAY-000124.pdf
```

MongoDB stores:

```text
PaymentReceipt
├── storageKey
├── originalFilename
├── mimeType
├── fileSize
├── uploadedAt
├── uploadedBy
└── ...
```

This will scale much better.

---

# 10. OCR Corrections

Suppose OCR says:

```text
Amount: ৳3,600
```

but receipt actually says:

```text
৳3,060
```

Accountant changes:

```text
3600 → 3060
```

The system should preserve:

```text
OCR extracted value = 3600
Corrected value = 3060
Corrected by = Moin
Corrected at = timestamp
```

This is valuable for audit.

It should **not simply overwrite the OCR result and erase evidence of the correction**.

---

# 11. Payment Status

I recommend these states:

```text
RECEIPT_UPLOADED
      ↓
PROCESSING
      ↓
EXTRACTED
      ↓
NEEDS_REVIEW
      ↓
READY_TO_POST
      ↓
POSTED
```

And error states:

```text
OCR_FAILED
MATCH_FAILED
DUPLICATE_SUSPECTED
```

For example:

> OCR succeeded but member could not be identified.

That should become:

```text
NEEDS_REVIEW
```

rather than creating a wrong payment.

---

# 12. Duplicate Receipt Protection

This is mandatory.

The same receipt could accidentally be uploaded twice.

The system should check:

* Transaction ID
* Gateway
* Amount
* Date
* Sender
* Receiver
* Receipt file hash/fingerprint

If an existing payment matches strongly:

> **Possible duplicate payment detected.**

Posting should require explicit confirmation.

---

# 13. Hosting: How Much Storage Do You Need?

There are two completely different resources here:

### Storage

Used for:

> payment receipt images/PDFs

### RAM

Used for:

> application + OCR processing + MongoDB if MongoDB is hosted on the same server.

Do not confuse the two.

---

## Your current organization size

From your NS Foundation design, you have approximately:

**40 members.**

Five years:

```text
40 members × 12 months × 5 years
= 2,400 monthly payments
```

If every payment has one receipt:

### At 500 KB average

```text
2,400 × 0.5 MB
≈ 1.2 GB
```

### At 1 MB average

```text
2,400 × 1 MB
≈ 2.4 GB
```

### At 2 MB average

```text
2,400 × 2 MB
≈ 4.8 GB
```

But you should allow for:

* PDFs
* larger bank statements
* duplicate uploads
* OCR processing files
* future membership growth
* backups
* thumbnails/previews
* multiple receipts for one payment
* system logs

### Therefore I would not buy only 5 GB.

For your project, I'd design around:

| Resource                |                  Suggested starting point |
| ----------------------- | ----------------------------------------: |
| Application RAM         |                          **2 GB minimum** |
| Application RAM         |                        **4 GB preferred** |
| SSD/application storage |                                **20 GB+** |
| Receipt/object storage  |                    **10–20 GB initially** |
| Database storage        | Separate from receipt storage if possible |
| Backup storage          |               Additional separate storage |

For only 40 members, **20 GB of receipt storage is already a substantial buffer** for five years.

If membership eventually becomes 100 members:

```text
100 × 12 × 5 = 6,000 receipts
```

Even at an average 2 MB:

```text
≈ 12 GB
```

So a 20–50 GB object-storage plan gives you considerably more room.

### OCR processing RAM

If OCR is performed locally on your own server, I would target **4 GB RAM** rather than 1 GB or 2 GB.

If we use an external OCR/document-AI service, the application server does not need to run the OCR engine itself, so the RAM requirement can be lower.

For your first implementation, I recommend designing the system so the **OCR provider is replaceable**.

---

# 14. Recommended Architecture

```text
                    ┌──────────────────┐
                    │    Accountant    │
                    └────────┬─────────┘
                             │
                      Upload Receipt
                             │
                             ▼
                    ┌──────────────────┐
                    │ Receipt Module   │
                    └────────┬─────────┘
                             │
                  OCR ENABLED?
                    /             \
                  YES              NO
                   │                │
                   ▼                ▼
             OCR Extraction    Manual Entry
                   │                │
                   └───────┬────────┘
                           ▼
                  Validation Layer
                           │
                           ▼
                   Member Matching
                           │
                           ▼
                Custody Account Match
                           │
                           ▼
                Payment Allocation
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
        Arrears/Current              Advance
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    Accountant Review
                           │
                           ▼
                     FINAL POSTING
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
       Payment       PaymentAllocation   Receipt
          │
          ▼
   CustodyMovement
          │
          ▼
    MonthlyLedger
```

---

# 15. Changes I Would Make to the Domain Model

Your existing architecture needs an additional entity:

## `PaymentReceipt`

It should represent the uploaded evidence and OCR lifecycle.

Conceptually:

```text
PaymentReceipt
├── paymentId                  optional until posted
├── uploadedBy
├── originalFilename
├── storageKey
├── mimeType
├── fileSize
├── gateway
├── extractionStatus
├── verificationStatus
├── extractedData
├── correctedData
├── confidence
├── duplicateCheckStatus
├── uploadedAt
├── processedAt
├── verifiedAt
└── verifiedBy
```

I would **not put OCR fields directly into `Payment` as the only record**, because OCR is an input/extraction process whereas `Payment` is an accounting transaction.

---

# 16. Detailed Codex Prompt

Since your current project is already structured as:

```text
NSFoundationWebApp/
├── frontend/
├── backend/
└── docs/
```

and you want Codex/Antigravity to work incrementally, give it the following prompt.

## `PROMPT — Implement Optional Payment Receipt OCR Module`

```text
You are developing the NS Foundation Web Application.

The project uses:

- MERN
- TypeScript
- React
- Express
- MongoDB
- Mongoose

The approved project structure is:

NSFoundationWebApp/
├── frontend/
├── backend/
└── docs/

frontend/ contains frontend code only.

backend/ contains Express, business logic, database models,
services, OCR integration, payment processing and all backend logic.

docs/ contains project documentation.

============================================================
IMPORTANT ARCHITECTURAL RULE
============================================================

Implement Payment Receipt OCR as an OPTIONAL feature.

The existing Contributions & Payments module must continue to
work without OCR.

There must be two payment-entry paths:

1. Manual Payment Entry
2. Receipt/OCR Payment Entry

OCR must never become a mandatory dependency of the payment system.

If OCR is disabled, unavailable, fails, or reaches a provider limit,
the accountant must still be able to enter payments manually.

============================================================
BUSINESS OBJECTIVE
============================================================

Members send monthly payment receipts to the accountants.

Accountants upload those receipt files into the application.

Receipts may come from:

- bKash
- Nagad
- Bank

Receipt formats may include:

- JPG
- JPEG
- PNG
- WEBP if supported
- PDF

The accountant may upload:

- one receipt
- multiple receipts
- a batch containing different receipt types
- receipts belonging to different members

The system must process each receipt independently.

============================================================
CORE WORKFLOW
============================================================

Receipt upload:

Accountant
    ↓
Upload receipt(s)
    ↓
Store original receipt securely
    ↓
OCR/document extraction
    ↓
Extract structured candidate data
    ↓
Validate extracted data
    ↓
Identify member
    ↓
Identify payment gateway
    ↓
Identify sender account if available
    ↓
Identify receiver account if available
    ↓
Match receiver to CustodyAccount
    ↓
Extract amount
    ↓
Extract payment date
    ↓
Extract transaction/reference ID if available
    ↓
Check duplicate payment
    ↓
Calculate member outstanding obligations
    ↓
Run Payment Allocation Engine
    ↓
Show proposed allocation
    ↓
Accountant reviews
    ↓
Accountant can correct OCR data
    ↓
Accountant confirms
    ↓
Post final Payment
    ↓
Create PaymentAllocation records
    ↓
Create corresponding CustodyMovement
    ↓
Update/rebuild relevant MonthlyLedger projection
    ↓
Create AuditLog
    ↓
Link original receipt to final Payment

============================================================
OCR EXTRACTION
============================================================

The OCR/document extraction layer should attempt to extract:

- member name
- member ID if present
- sender account/phone/account identifier
- receiver account/phone/account identifier
- payment gateway
- amount
- payment date
- transaction ID
- reference number
- gateway fee/cash-out fee if explicitly shown
- receipt/reference text
- document type

Not every receipt will contain every field.

Missing fields must remain null/unknown.

The OCR system must NEVER invent missing values.

============================================================
MEMBER MATCHING
============================================================

Member identification should use a deterministic matching strategy.

Preferred order:

1. Exact registered payment identifier match
2. Exact member ID match if present
3. Strong receipt name match
4. Other configured identifiers
5. Manual accountant selection

If multiple members are possible matches:

- do NOT automatically post the payment
- show candidate members
- require accountant confirmation

If no reliable member is found:

- status = NEEDS_REVIEW
- do not post the payment automatically

The accountant must be able to select the correct member manually.

============================================================
CUSTODY ACCOUNT MATCHING
============================================================

The receipt may contain the receiver account.

Use the registered CustodyAccount records to identify
which Foundation/accountant account received the money.

Examples:

Moin bKash
Samrat Nagad
Moin Bank
Samrat Bank

Do NOT hardcode names such as "Moin" or "Samrat" in business logic.

Use:

- User
- accountantType
- CustodyAccount
- gateway
- accountIdentifier

for matching.

If the receiver account cannot be identified:

- mark the field as unresolved
- require accountant confirmation

============================================================
PAYMENT RECONCILIATION
============================================================

The OCR system must NOT independently calculate accounting balances.

After extraction, pass the proposed payment data into the
existing Payment/PaymentAllocation business service.

The allocation engine is responsible for:

- previous unpaid monthly dues
- principal/share contribution
- applicable penalties
- current month obligation
- advance payments
- remaining credit
- historical 2024 reconciliation rules where applicable

The OCR layer only supplies candidate payment data.

============================================================
ARREARS
============================================================

If a member pays multiple previous months:

The system must show exactly which months are being settled.

Example:

Payment received = ৳3,060

Show:

Month | Share | Principal | Penalty | Total | Status

March 2026
April 2026
May 2026
etc.

The actual values must come from the organization's approved
business rules and MemberYearAccount/MonthlyLedger state.

Do not invent a new allocation policy.

============================================================
ADVANCE PAYMENT
============================================================

If the payment exceeds all currently outstanding obligations:

The remaining amount must become advance credit.

The UI must clearly show:

- amount applied to arrears
- amount applied to current obligation
- amount applied to advance
- remaining unallocated amount, if any

Advance must not be counted twice.

When a future month's obligation becomes due, the system may
consume the available advance according to the approved
payment allocation rules.

============================================================
2024 HISTORICAL SHARE RECONCILIATION
============================================================

Respect the approved NS Foundation 2024 share-adjustment rules.

2024 is a historical special case.

December 2024 final share reconciliation determines the
annual 2024 share baseline.

Do NOT replace the approved MemberYearAccount/ShareHistory logic.

Do NOT apply 2025 share-lock rules incorrectly to 2024.

From January 1, 2025 normal share changes are locked according
to the approved domain architecture.

============================================================
PAYMENT RECEIPT ENTITY
============================================================

Create a dedicated PaymentReceipt model.

Do not make PaymentReceipt a replacement for Payment.

PaymentReceipt represents evidence and extraction lifecycle.

Payment represents the actual accounting transaction.

Suggested fields:

PaymentReceipt:

- _id
- paymentId (nullable until final posting)
- uploadedBy
- originalFilename
- storageKey
- mimeType
- fileSize
- documentHash
- extractionStatus
- verificationStatus
- extractedData
- correctedData
- confidence
- duplicateCheckStatus
- uploadedAt
- processedAt
- verifiedAt
- verifiedBy
- createdAt
- updatedAt

Use appropriate enums/status values.

============================================================
EXTRACTION DATA
============================================================

Keep extracted data structurally separate from final accounting data.

Example:

extractedData:

{
  memberName,
  memberId,
  senderIdentifier,
  receiverIdentifier,
  gateway,
  amount,
  paymentDate,
  transactionId,
  referenceNumber,
  gatewayFee
}

Do not copy uncertain OCR values directly into final Payment
without validation/review.

============================================================
OCR CORRECTION
============================================================

The accountant must be able to edit OCR results.

Example:

OCR:

amount = 3600

Accountant corrects:

amount = 3060

The system must preserve both:

original extracted value = 3600
corrected value = 3060

Do not erase the original OCR extraction.

Record:

- correctedBy
- correctedAt
- original value
- corrected value

Sensitive corrections must generate an AuditLog entry.

============================================================
CONFIDENCE
============================================================

Support confidence information for extracted fields.

Example:

memberName confidence = 0.96
amount confidence = 0.99
gateway confidence = 0.99

Do not create a fake confidence score if the selected OCR
provider does not provide one.

Use null when unavailable.

The application should support a configurable review threshold.

For example:

HIGH CONFIDENCE
→ eligible for quick review

MEDIUM/LOW CONFIDENCE
→ accountant review required

Do NOT automatically post financial transactions merely because
OCR confidence is high.

Final posting must follow the application's payment verification
rules.

============================================================
PAYMENT STATUS
============================================================

Use clear lifecycle statuses.

Suggested:

RECEIPT_UPLOADED
PROCESSING
EXTRACTED
NEEDS_REVIEW
READY_TO_POST
POSTED
OCR_FAILED
MATCH_FAILED
DUPLICATE_SUSPECTED

Do not allow invalid state transitions.

============================================================
DUPLICATE DETECTION
============================================================

Prevent accidental double posting.

Use available information such as:

- transaction ID
- gateway
- amount
- payment date
- sender
- receiver
- document hash

If an existing payment appears to match:

Set:

DUPLICATE_SUSPECTED

Do not silently create another financial transaction.

Allow authorized accountant/admin review.

============================================================
FILE STORAGE
============================================================

Store original receipt files.

Do NOT store large image/PDF binary content directly inside
MongoDB unless there is an explicit architectural reason.

Prefer:

file/object storage
+
MongoDB metadata

Store:

- storageKey
- filename
- MIME type
- size
- hash
- upload timestamp
- uploader

The storage implementation must be abstract enough that it can
later use:

- local storage during development
- cloud/object storage in production

Do not hardcode the application to one storage vendor.

============================================================
SECURITY
============================================================

Receipt files may contain sensitive financial information.

Implement:

- authenticated access
- authorization checks
- no public receipt URLs
- controlled download/view endpoint
- file type validation
- maximum file size validation
- safe filename handling
- generated storage keys
- document hash
- no execution of uploaded files

Do not expose receipt storage paths publicly.

============================================================
BATCH UPLOAD
============================================================

Support multiple receipt files in one upload request.

Each file must have an independent processing result.

Example:

Batch:

10 receipts

Results:

7 POSTED/READY_TO_POST
2 NEEDS_REVIEW
1 OCR_FAILED

One failed receipt must not cause the entire batch to fail.

Show batch processing status clearly.

============================================================
OPTIONAL OCR CONFIGURATION
============================================================

Create configuration allowing OCR to be enabled/disabled.

Example:

OCR_ENABLED=true/false

When false:

- receipt upload may still be available
- OCR processing must not execute
- accountant can manually enter payment data

Do not make the application unusable when OCR is disabled.

============================================================
OCR PROVIDER ABSTRACTION
============================================================

Do not tightly couple business logic to one OCR provider.

Create an abstraction such as:

ReceiptExtractionService

or

OCRProvider interface

Business logic should depend on the abstraction, not a specific
vendor SDK.

Example conceptual flow:

PaymentReceiptService
       ↓
OCRProvider
       ↓
ExtractionResult
       ↓
Validation
       ↓
PaymentAllocationService

The exact provider can be selected later.

Do not add an expensive paid OCR service without configuration.

Do not hardcode API keys.

============================================================
API DESIGN
============================================================

Create appropriate backend endpoints/services for:

- upload single receipt
- upload batch receipts
- process/reprocess receipt
- retrieve extraction result
- manually correct extraction
- match/select member
- match/select CustodyAccount
- preview payment allocation
- confirm/post payment
- view receipt
- download receipt if authorized
- list receipt processing history

Use the project's existing API conventions.

Do not bypass service-layer business rules from controllers.

============================================================
FRONTEND
============================================================

Create a basic Contributions & Payments receipt workflow UI.

Do NOT build the entire application UI.

Create only the components/pages necessary to test this feature.

The UI should support:

1. Upload receipt
2. Batch upload
3. Processing status
4. OCR extracted data
5. Confidence indicators where available
6. Suggested member
7. Suggested CustodyAccount
8. Payment amount
9. Payment date
10. Gateway
11. Transaction ID
12. Editable fields
13. Proposed allocation
14. Arrears by month
15. Current month
16. Advance months/amount
17. Duplicate warning
18. Accountant confirmation
19. Final posting result

The accountant must be able to correct any extracted field
before posting.

============================================================
ACCOUNTING INTEGRITY
============================================================

CRITICAL:

OCR must never directly modify:

- member balance
- custody balance
- MonthlyLedger
- Payment
- PaymentAllocation

without passing through the application's validated business
service.

Final financial posting must create the proper source-of-truth
records.

Expected relationship:

Receipt
   ↓
Extraction
   ↓
Validation
   ↓
Payment Service
   ↓
Payment
   ↓
PaymentAllocation
   ↓
CustodyMovement
   ↓
MonthlyLedger projection
   ↓
AuditLog

Do not directly edit cached balances.

============================================================
AUDIT
============================================================

Record audit events for:

- receipt upload
- OCR processing
- manual correction
- member reassignment
- CustodyAccount reassignment
- duplicate override
- payment confirmation
- payment posting
- payment reversal/correction if supported

Preserve who performed each action and when.

============================================================
TESTING
============================================================

Create tests for at least:

1. Receipt metadata creation
2. OCR extraction result validation
3. Missing OCR fields
4. Member matching
5. Ambiguous member matching
6. CustodyAccount matching
7. Duplicate detection
8. Manual OCR correction
9. Batch upload
10. OCR failure
11. OCR disabled
12. Payment allocation integration
13. Arrears allocation
14. Advance allocation
15. Final posting
16. Audit logging
17. Unauthorized receipt access

Do not use real member financial information in tests.

============================================================
STORAGE ESTIMATION
============================================================

Design the storage layer for approximately:

40 members
× 12 months
× 5 years
= approximately 2,400 monthly receipts

However, do not hardcode 40 members.

The system must support future growth.

Do not assume every payment has exactly one receipt.

Multiple receipts may exist for a single payment if the business
workflow requires it.

============================================================
IMPORTANT NON-GOALS
============================================================

Do NOT:

- redesign the NS Foundation business rules
- change the 2024 share reconciliation rules
- change the 2025 share lock
- implement project-level member ownership
- assign individual members to investment projects
- bypass PaymentAllocation
- directly edit custody balances
- make OCR mandatory
- automatically post uncertain member matches
- expose receipt files publicly
- store secrets in source code
- introduce unnecessary dependencies

============================================================
DOCUMENTATION
============================================================

Update the relevant documentation after implementation.

At minimum document:

docs/DATABASE-SCHEMA.md
docs/API-SPECIFICATION.md
docs/BUSINESS-RULES.md
docs/SYSTEM-DEVELOPMENT-GUIDELINE.md
docs/CHANGELOG.md

Document:

- PaymentReceipt
- OCR workflow
- receipt storage
- extraction lifecycle
- correction workflow
- duplicate detection
- batch processing
- payment allocation integration
- security rules
- OCR optional configuration

Do not overwrite authoritative business rules with assumptions.

============================================================
VERIFICATION
============================================================

Before declaring the task complete:

1. Run TypeScript type checking.
2. Run backend tests.
3. Run frontend tests if configured.
4. Run production builds.
5. Verify receipt upload.
6. Verify batch upload.
7. Verify OCR-disabled workflow.
8. Verify OCR failure workflow.
9. Verify manual correction.
10. Verify duplicate detection.
11. Verify payment allocation preview.
12. Verify final posting.
13. Verify AuditLog.
14. Verify protected receipt access.

Do not claim a feature works if it has not actually been tested.

============================================================
FINAL REPORT
============================================================

At completion report:

1. Files created
2. Files modified
3. Database models added/changed
4. API endpoints added
5. Frontend components added
6. OCR provider abstraction
7. Storage implementation
8. Environment variables
9. NPM packages added
10. Tests created
11. Test results
12. Build results
13. Known limitations
14. Any unresolved architectural decision

Do not implement unrelated features.
Do not redesign the approved NS Foundation architecture.
```

---

## One more architectural recommendation

For your project, I would **not make "OCR" itself a permanent dependency of the financial system**.

Think of it as:

```text
                OPTIONAL
           ┌───────────────┐
           │ OCR / Receipt │
           └───────┬───────┘
                   │
                   ▼
             Payment Service
                   │
          ┌────────┴────────┐
          ▼                 ▼
       Payment       PaymentAllocation
                            │
                            ▼
                     CustodyMovement
                            │
                            ▼
                      MonthlyLedger
```

This means five years from now, even if the OCR provider changes, becomes expensive, or disappears, **your historical financial records remain intact**. The receipts and their extraction/correction history remain archived, while the actual financial truth continues to live in `Payment`, `PaymentAllocation`, `CustodyMovement`, and the other source-of-truth entities.

### Storage recommendation for your current scale

For the approximately **2,400 receipts** implied by 40 members × 12 months × 5 years, I'd architect for **at least 20 GB of receipt/object storage**, with **4 GB RAM** as a comfortable starting point if your own server will perform OCR. If OCR is outsourced to an external document/OCR service, the application server can start with less RAM. Keep **receipt storage separate from MongoDB storage** where possible, and maintain a separate backup.

The important part is that the application should **not impose a 40-member/5-year limit**; those numbers should only be used for capacity planning.
