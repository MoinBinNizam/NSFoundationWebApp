# Historical Investments Reconciliation & Verification Report

## Authoritative Source
- **File**: `docs/import-historical-evidence/Investment.xlsx`
- **Sheet**: `Investment`
- **Historical Scope**: Rows 3 to 21 (19 projects total)
- **Controlled Migration Manifest**: `docs/import-historical-evidence/normalized-manifests/investments-staging/staging-manifest.json`

---

## 1. Executive Summary & Corrections
1. **Restaurant Hungry Birds Barisal (SL 05) Correction**:
   - In `Investment.xlsx` Row 07, `Restaurant` (Hungry Birds Barisal) is recorded with `Status = Running`, `Pay Date = 2024-07-17`, `Amount = ৳60,000`, `ROI = ৳8,500`.
   - **Correction**: The status is **RUNNING**, not matured. The ৳8,500 ROI column represents expected profit, **NOT** money returned to custody. No principal return and no profit return has occurred. Erroneous automatic return generation has been eliminated; total returned recorded is strictly **৳0.00**.
2. **Authoritative Invoice Numbers Stored**:
   - All projects with an invoice number in column `Invoice No` have their exact invoice identifier stored in MongoDB (`invoiceNo`) and surfaced throughout the application UI and audit trail.
3. **Matured vs Active Project Verification**:
   - **12 Projects Matured**: SL 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13
     - Total Principal Returned: **৳392,197.00**
     - Total Profit Realized: **৳91,024.44**
     - Total Proceeds Returned: **৳483,221.44**
   - **7 Projects Active (Running)**: SL 5 (Hungry Birds Barisal), 14, 15, 16, 17, 18, 19
     - Active Outstanding Capital: **৳878,341.00**
     - Total Returned: **৳0.00**
   - **Total Historical Investment Capital**: **৳1,270,538.00** (Exact match to Excel Row 25 `Total Investment: 1270538`).
4. **Funding Distribution (Konserved ৳1,270,538.00)**:
   - **Moin Custody**: ৳380,160.00 (Excel Row 25 Col 18)
   - **Samrat Custody**: ৳119,000.00 (Excel Row 25 Col 19)
   - **Partner Wallets / Re-invest**: ৳771,378.00 (Excel Row 25 Col 17)
   - Variance: **৳0.00 (0 variances)**.

---

## 2. Row-by-Row Project & Invoice Audit Table

| SL | Invoice No | Invoiced To | Start Date | End Date | Project Name | Status | Principal (৳) | Expected ROI Yearly (%) | Returns (৳) | Return Profit (৳) |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | `#1094` | Shuvo | 2024-04-21 | 2024-10-18 | G9 Banaa - 02 | MATURED | 26,400 | 38.78% | 26,400 | 5,119.00 |
| 02 | `#1268` | Shuvo | 2024-05-12 | 2024-10-09 | Biofloc fish farming-2 | MATURED | 10,800 | Variable | 10,800 | 1,664.00 |
| 03 | `#1287` | Shuvo | 2024-05-12 | 2024-08-10 | special project (export) 4 | MATURED | 20,000 | Variable | 20,000 | 1,750.00 |
| 04 | `#1457` | Shuvo | 2024-05-20 | 2024-11-16 | G9 Banaa - 03 | MATURED | 12,800 | Variable | 12,800 | 2,482.14 |
| 05 | *(None)* | Moin | 2024-07-17 | 2025-07-17 | Restaurant (Hungry Birds) | **ACTIVE** | 60,000 | 14.17% | **0** | **0** |
| 06 | `#2607` | Shuvo | 2024-09-10 | 2025-03-09 | Papaya 3 | MATURED | 39,710 | Variable | 39,710 | 7,545.00 |
| 07 | `#2788` | Shuvo | 2024-09-12 | 2025-06-09 | Goat 3 | MATURED | 12,000 | Variable | 12,000 | 3,407.00 |
| 08 | `#3124` | Shuvo | 2024-10-10 | 2025-02-07 | Dry Fish-3 | MATURED | 15,200 | Variable | 15,200 | 1,824.00 |
| 09 | `#3263` | Shuvo | 2024-10-10 | 2025-05-08 | Cattle Ranch-4 | MATURED | 12,464 | Variable | 12,464 | 2,822.50 |
| 10 | `#3594` | Shuvo | 2024-10-27 | 2025-06-28 | Onion Preservation - 3 | MATURED | 31,519 | Variable | 31,519 | 8,195.00 |
| 11 | `#4478` | Shuvo | 2024-12-10 | 2025-08-08 | Qurbani Cow-1 | MATURED | 115,280 | 40.0% | 115,280 | 30,741.00 |
| 12 | `#5791` | Shuvo | 2025-02-12 | 2025-10-10 | Sugar Cane Export-2 | MATURED | 60,000 | 40.0% | 60,000 | 16,000.80 |
| 13 | `#7224 #7210` | Shuvo | 2025-03-14 | 2025-11-09 | Banana-4 | MATURED | 36,024 | 40.0% | 36,024 | 9,474.00 |
| 14 | `#18257` | Shuvo | 2025-10-20 | 2026-06-20 | Qurbani Cow-3 | ACTIVE | 200,000 | 40.0% | 0 | 0 |
| 15 | `#0169` | Shuvo | 2025-10-13 | 2026-04-13 | Land Trading -4 | ACTIVE | 100,000 | 40.0% | 0 | 0 |
| 16 | `#804` | Shuvo | 2026-01-15 | 2026-07-15 | Land Trading -6 | ACTIVE | 80,000 | 40.0% | 0 | 0 |
| 17 | `#PIW-831-18778` | Shuvo | 2026-03-26 | 2026-09-24 | Agro Stock | ACTIVE | 35,000 | 39.0% | 0 | 0 |
| 18 | `INV-2026-P9FFX9GC` | Shuvo | 2026-04-30 | 2026-07-30 | Integrated Agro Project - 1 | ACTIVE | 150,000 | 50.0% | 0 | 0 |
| 19 | `#PIW-831-18781` | Shuvo | 2026-07-16 | 2027-01-15 | Sugar Cane-5 | ACTIVE | 253,341 | 40.0% | 0 | 0 |
| **Total** | | | | | | | **1,270,538** | | **392,197** | **91,024.44** |

---

## 3. Localization & UX Standard
- **Category (শ্রেনী)**:
  - All localization dictionaries translate Category / Catagory to `শ্রেনী`.
  - In "New Investment Project" modal, authorized users can choose from existing categories or enter a **New Custom Category** (`+ নতুন শ্রেনী যোগ করুন`), saving new project categories dynamically.
- **Matured (পরিপক্ব)**:
  - Translated as `পরিপক্ব` everywhere (`Matured / Realized` -> `পরিপক্ব`, `MATURED` status tag -> `পরিপক্ব`).
- **Expected ROI yearly (%) (বাৎসরিক সম্ভাব্য লাভের হার (%))**:
  - Labels updated explicitly from "Expected ROI (%)" to "Expected ROI yearly (%)" / `বাৎসরিক সম্ভাব্য লাভের হার (%)`.
