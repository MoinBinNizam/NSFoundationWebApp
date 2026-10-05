# January 2024 staging package

This package was prepared from the authoritative January 2024 workbook. It is review-only and has not been posted to MongoDB.

| Control | Value |
|---|---:|
| Member ledgers | 40 |
| Historical payment records | 34 |
| Payment allocation records | 39 |
| Payment total | ৳35,000.00 |
| January principal due remaining | ৳4,500.00 |
| Member-specific future advance | ৳3,000.00 |

## Rules applied

- NSF032, NSF034, and NSF035 retain their own January dues totalling ৳4,500.
- Advances remain under the paying member only: NSF023 ৳500; NSF030 ৳1,000; NSF031 ৳1,500.
- NSF001 and NSF002 are represented as two historical receipts each because the source comments provide separate payment dates.
- January has no source penalty or cash-out collection.
- `Self` uses Cash custody; Bank, bKash, and Nagad retain their source gateway.

## Posting gate

Before a staging-database posting run, map every manifest member ID to the registered Member record and each source receiver/gateway pair to an active historical custody account. Preserve the `source_ref` in notes/audit evidence and do not generate or invent external transaction IDs.
