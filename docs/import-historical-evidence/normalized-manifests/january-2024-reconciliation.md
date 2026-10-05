# January 2024 reconciliation review

Source: `Month_January_2024.xlsx`, sheet `January, 2024`. This workbook is the authoritative January 2024 source.

## Source controls

| Control | Value |
|---|---:|
| Member rows | 35 |
| Total shares | 73 |
| Normal January obligation at ৳500/share | ৳36,500 |
| Source payment total | ৳35,000 |
| Source due column total | ৳0 |
| Source penalty column total | ৳0 |
| Rows with a received amount | 32 |
| Blank-payment rows | 3 |

## Source collection routing

| Gateway | Rows | Source total | Historical custody mapping |
|---|---:|---:|---|
| Bank | 4 | ৳7,000 | Bank custody held by Moin |
| bKash | 18 | ৳17,000 | bKash custody held by Moin |
| Cash (`Self`) | 2 | ৳3,000 | Cash custody held by the named accountant/member |
| Nagad | 8 | ৳8,000 | Nagad custody held by Samrat |
| No payment | 3 | ৳0 | No custody movement |

The source receiver split is ৳25,000 for Moin and ৳10,000 for Samrat.

## Required decisions before posting

### 1. Member-specific January dues and advances

Three members have no January payment: NSF032 (2 shares), NSF034 (6 shares), and NSF035 (1 share). Their normal January obligation is ৳4,500.

The source includes ৳3,000 of explicit advance payments. These advances belong only to the named members and must never offset another member's unpaid amount:

| Member | Amount received | Normal January amount | Advance indicated by source comment |
|---|---:|---:|---:|
| NSF023 | ৳1,000 | ৳500 | ৳500 for February |
| NSF030 | ৳2,000 | ৳1,000 | ৳1,000 for February |
| NSF031 | ৳2,000 | ৳500 | ৳1,500 for February–April |

The three members with blank January payments have their own January principal dues:

| Member | Shares | January principal due |
|---|---:|---:|
| NSF032 | 2 | ৳1,000 |
| NSF034 | 6 | ৳3,000 |
| NSF035 | 1 | ৳500 |

Their total is ৳4,500. It remains due under those three member IDs until each member pays it, with the applicable penalty unless a waiver is approved. The ৳3,000 advance above is retained only against NSF023, NSF030, and NSF031's own future months. It does not reduce the ৳4,500 owed by NSF032, NSF034, or NSF035.

### 2. Split physical receipts

The source comments identify two members who paid in more than one transaction:

| Member | Source amount | Source detail | Recommended import treatment |
|---|---:|---|---|
| NSF001 | ৳2,500 | ৳1,000 on 2 January and ৳1,500 on 21 January | Two historical payment records, each with the stated date |
| NSF002 | ৳2,000 | ৳1,000 on 2 January and ৳1,000 on 23 January | Two historical payment records, each with the stated date |

No transaction references are in the workbook. Create the records with a `HIST-2024-01` source label and the comment text, rather than inventing gateway transaction IDs.

### 3. Advance allocations

The three explicit advances should be posted only after the January current-month principal is posted. Their future allocations must be preserved as follows:

- NSF023: January principal ৳500, February advance ৳500.
- NSF030: January principal ৳1,000, February advance ৳1,000.
- NSF031: January principal ৳500, February–April advance ৳1,500.

## Proposed January posting order after approval

1. Create January monthly obligations from the authoritative share counts.
2. Post 34 historical payment records: the 32 paid source rows, split into two records each for NSF001 and NSF002.
3. Allocate explicit advances to the specified future months.
4. Post no penalty and no cash-out charge for January unless a source correction is approved.
5. Create unpaid January ledger entries for NSF032 (৳1,000), NSF034 (৳3,000), and NSF035 (৳500). Do not offset them with advances paid by other members.
6. Reconcile payment total, gateway totals, receiver totals, monthly ledger totals, custody inflows, and audit records before proceeding to February.

No January records have been posted yet.
