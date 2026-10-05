# Historical import manifest review

This review-only manifest is generated from the private workbook evidence. It does not post, alter, or approve database records.

## Payment workbook inventory

| Period | Rows | Payment candidates | Received total | Due/unpaid review rows |
|---|---:|---:|---:|---:|
| 2024-01 | 35 | 32 | ৳35,000.00 | 3 |
| 2024-02 | 35 | 32 | ৳31,000.00 | 3 |
| 2024-03 | 45 | 31 | ৳31,540.00 | 14 |
| 2024-04 | 46 | 28 | ৳28,740.00 | 18 |
| 2024-05 | 46 | 29 | ৳34,135.00 | 17 |
| 2024-06 | 46 | 24 | ৳27,560.00 | 22 |
| 2024-07 | 46 | 24 | ৳27,630.00 | 22 |
| 2024-08 | 46 | 24 | ৳35,790.00 | 22 |
| 2024-09 | 92 | 21 | ৳27,210.00 | 25 |
| 2024-10 | 46 | 25 | ৳40,480.00 | 21 |
| 2024-11 | 40 | 21 | ৳27,010.00 | 19 |
| 2024-12 | 36 | 29 | ৳47,510.00 | 7 |
| 2025-01 | 35 | 22 | ৳33,820.00 | 13 |
| 2025-02 | 35 | 21 | ৳28,000.00 | 14 |
| 2025-03 | 35 | 14 | ৳23,350.00 | 21 |
| 2025-04 | 35 | 15 | ৳27,350.00 | 20 |

Detected 46 potential duplicate source rows. They are retained for evidence but excluded from posting until resolved.

## Detected schemas

| File | Period | Columns |
|---|---|---|
| Month - September 2024.xlsx | 2024-09 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, balance, comment |
| Month_April_2024.xlsx | 2024-04 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_August_2024.xlsx | 2024-08 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_December_2024.xlsx | 2024-12 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, balance, comment |
| Month_February_2024.xlsx | 2024-02 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_January_2024.xlsx | 2024-01 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_January_2025.xlsx | 2025-01 | member id, member name, no. of shares, amount, paid amount, payment date, due penalty, paid penalty, previous due, due, co charge, getway, receiver, balance, comment |
| Month_July_2024.xlsx | 2024-07 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_June_2024.xlsx | 2024-06 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_March_2024.xlsx | 2024-03 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_May_2024.xlsx | 2024-05 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_November_2024.xlsx | 2024-11 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_October_2024.xlsx | 2024-10 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, comment |
| Month_September_2024.xlsx | 2024-09 | member id, name, no. of share, amount, gateway, receiver, date of payment, due, penalty, balance, comment |
| NS Foundation April-2025.xlsx | 2025-04 | member id, member name, no. of shares, amount, paid amount, payment date, due penalty, paid penalty, previous due, due, co charge, gatetway, receiver, balance, comment |
| NS Foundation February-2025.xlsx | 2025-02 | member id, member name, no. of shares, amount, paid amount, payment date, due penalty, paid penalty, previous due, due, co charge, gatetway, receiver, balance, comment |
| NS Foundation March-2025.xlsx | 2025-03 | member id, member name, no. of shares, amount, paid amount, payment date, due penalty, paid penalty, previous due, due, co charge, gatetway, receiver, balance, comment |

## Normalization rules applied

- `Bkash`, `bkash`, and `BKash` are normalized to `bKash`.
- `Nagad` and `nagad` are normalized to `Nagad`.
- `Self` is normalized to `Cash`, per the supplied accounting interpretation.
- Payment amount, dues, penalty, cash-out charge, balance, comments, original gateway, source row, and colour metadata are retained. No allocation is inferred from colour alone.

## Required reconciliation before posting

- Confirm one source member ID maps to one production member.
- Resolve date/period conflicts, including advance payments recorded in a prior month.
- Review all `DUE_OR_UNPAID_REVIEW` rows and color-coded penalty/due values with the accountant.
- Reconcile each accepted payment to a valid receiver and a historical custody opening/transfer position.
- Reconcile each investment to project, funding source, payment, return, and custody evidence.

## Investment inventory

The investment manifest has 20 source rows. Every row remains pending project and custody reconciliation.

## Files generated

- `payment-manifest-review.csv`: one normalized source row per historical member/month row.
- `investment-manifest-review.csv`: one normalized investment source row.
- `manifest-analysis.md`: this reconciliation summary.
