"""Create a reviewable April 2025 member-by-member import manifest.

The source workbook is never changed.
The April 2025 workbook was cloned from the March 2025 sheet: only rows with actual
April 2025 payment dates (NSF001, NSF002, NSF005) represent genuine April cash receipts.
Carried-over March rows (payment dates in March 2025) are recognized as prior-month duplicates
and excluded from April cash receipts to preserve strict cash conservation.
Advances for NSF029 (from March 2025) and NSF035 (from January 2025) are cleanly applied.
FIFO arrear allocations for NSF005 (Jan, Feb, Mar, Apr 2025) are resolved.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

SOURCE = Path("docs/import-historical-evidence/NS Foundation April-2025.xlsx")
OUT = Path("docs/import-historical-evidence/normalized-manifests/april-2025-staging")
MONTH = "2025-04"
RATE = 500.0


def value(item: Any) -> str:
    if item is None:
        return ""
    if isinstance(item, (date, datetime)):
        return item.strftime("%Y-%m-%d")
    return str(item).strip()


def number(item: Any) -> float:
    try:
        return float(item)
    except (TypeError, ValueError):
        return 0.0


def gateway(item: Any) -> str:
    return {"bkash": "BKASH", "nagad": "NAGAD", "bank": "BANK", "cash": "CASH", "select": ""}.get(value(item).lower(), "")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ws = openpyxl.load_workbook(SOURCE, data_only=True)["April 25"]
    ledgers, payments, allocations = [], [], []

    for row in range(3, 38):
        member_id = value(ws.cell(row, 1).value).upper()
        if not member_id.startswith("NSF"):
            continue
        name, shares = value(ws.cell(row, 2).value), number(ws.cell(row, 3).value)
        raw_paid = ws.cell(row, 5).value
        pdate_raw = ws.cell(row, 6).value
        pdate_str = value(pdate_raw)
        source_due_pen = number(ws.cell(row, 7).value)
        comment = value(ws.cell(row, 15).value)
        principal_due = shares * RATE

        # Only rows with genuine April payment dates are counted as April receipts
        is_april_payment = bool(pdate_str and pdate_str >= "2025-04-01" and number(raw_paid) > 0)
        received = number(raw_paid) if is_april_payment else 0.0

        custom_allocations = []
        apr_principal_paid = 0.0
        penalty_due = 0.0
        penalty_paid = 0.0
        advance_applied = 0.0
        excess_advance = 0.0

        if member_id == "NSF035":
            # Paid full-year advance in January 2025 (৳500 for April 2025)
            apr_principal_paid = 500.0
            advance_applied = 500.0
        elif member_id == "NSF029":
            # Paid ৳500 advance for April in March 2025
            apr_principal_paid = 500.0
            advance_applied = 500.0
        elif member_id == "NSF005":
            # Paid ৳4,000 on 2025-04-18: clears Jan (৳1,000), Feb (৳1,000), Mar (৳1,000), and Apr (৳1,000)
            custom_allocations.append({"target_month": "2025-01", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2025-02", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2025-03", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            apr_principal_paid = 1000.0
            penalty_due = source_due_pen or (shares * 40.0)
        elif is_april_payment and received > 0:
            apr_principal_paid = min(principal_due, received)
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": apr_principal_paid})
        else:
            apr_principal_paid = 0.0
            penalty_due = source_due_pen or (shares * 40.0)

        ref = f"HIST-2025-04-R{row:02d}"

        ledgers.append({
            "source_ref": ref,
            "member_id": member_id,
            "member_name": name,
            "month": MONTH,
            "share_count": int(shares),
            "principal_due": principal_due,
            "principal_paid": apr_principal_paid,
            "penalty_due": penalty_due,
            "penalty_paid": penalty_paid,
            "advance_applied": advance_applied,
            "excess_advance": excess_advance,
            "status": "PAID" if apr_principal_paid >= principal_due and penalty_due == penalty_paid else ("PARTIAL" if (apr_principal_paid > 0 or penalty_paid > 0) else "DUE"),
            "comment": comment,
        })

        if is_april_payment and received > 0:
            pref = f"PAY-2025-04-R{row:02d}"
            gw = gateway(ws.cell(row, 12).value)
            rcv = value(ws.cell(row, 13).value).capitalize()

            payments.append({
                "payment_ref": pref,
                "source_ref": ref,
                "member_id": member_id,
                "member_name": name,
                "payment_date": pdate_str,
                "total_amount": received,
                "gateway": gw,
                "receiver_source": rcv,
                "comment": comment,
            })
            for alloc in custom_allocations:
                allocations.append({
                    "payment_ref": pref,
                    "member_id": member_id,
                    "target_month": alloc["target_month"],
                    "allocation_type": alloc["allocation_type"],
                    "amount": alloc["amount"],
                    "source_ref": ref,
                })

    manifest = {"ledgers": ledgers, "payments": payments, "allocations": allocations}
    (OUT / "staging-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    verification = {
        "month": MONTH,
        "members": len(ledgers),
        "totalShares": sum(l["share_count"] for l in ledgers),
        "paymentsCount": len(payments),
        "paymentsTotal": sum(p["total_amount"] for p in payments),
        "allocationsCount": len(allocations),
        "allocationsTotal": sum(a["amount"] for a in allocations),
        "byReceiver": {
            "Moin": sum(p["total_amount"] for p in payments if "moin" in p["receiver_source"].lower()),
            "Samrat": sum(p["total_amount"] for p in payments if "samrat" in p["receiver_source"].lower()),
        },
        "byGateway": {
            "BANK": sum(p["total_amount"] for p in payments if p["gateway"] == "BANK"),
            "BKASH": sum(p["total_amount"] for p in payments if p["gateway"] == "BKASH"),
            "NAGAD": sum(p["total_amount"] for p in payments if p["gateway"] == "NAGAD"),
        },
    }
    (OUT / "verification-summary.json").write_text(json.dumps(verification, indent=2), encoding="utf-8")
    print(json.dumps(verification, indent=2))


if __name__ == "__main__":
    main()
