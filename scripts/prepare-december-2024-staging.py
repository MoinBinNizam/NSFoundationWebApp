"""Create a reviewable December 2024 member-by-member import manifest.

The source workbook is never changed.
Cross-month FIFO arrear, retroactive share adjustments, and advance allocations for NSF006, NSF009, NSF011, NSF013, NSF015, NSF021, NSF023, NSF024, NSF028, NSF030, NSF031, NSF033, NSF034, and NSF035 are resolved cleanly.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

SOURCE = Path("docs/import-historical-evidence/Month_December_2024.xlsx")
OUT = Path("docs/import-historical-evidence/normalized-manifests/december-2024-staging")
MONTH = "2024-12"
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
    return {"bkash": "BKASH", "nagad": "NAGAD", "bank": "BANK", "cash": "CASH", "self": "CASH"}.get(value(item).lower(), "")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ws = openpyxl.load_workbook(SOURCE, data_only=True)["Dec, 2024"]
    ledgers, payments, allocations = [], [], []

    for row in range(3, 38):
        member_id = value(ws.cell(row, 1).value).upper()
        if not member_id.startswith("NSF"):
            continue
        name, shares = value(ws.cell(row, 2).value), number(ws.cell(row, 3).value)
        raw_amount = ws.cell(row, 4).value
        source_due, source_penalty = number(ws.cell(row, 8).value), number(ws.cell(row, 9).value)
        comment = value(ws.cell(row, 11).value)
        principal_due = shares * RATE
        received = number(raw_amount)

        custom_allocations = []
        dec_principal_paid = 0.0
        penalty_due = 0.0
        penalty_paid = 0.0
        advance_applied = 0.0
        excess_advance = 0.0

        if member_id == "NSF028":
            # Paid in advance in November 2024 (৳1,000 for Dec 2024)
            dec_principal_paid = 1000.0
            advance_applied = 1000.0
        elif member_id == "NSF031":
            # Paid in advance in November 2024 (৳500 for Dec 2024)
            dec_principal_paid = 500.0
            advance_applied = 500.0
        elif member_id == "NSF035":
            # Paid in advance in October 2024 (৳500 for Dec 2024)
            dec_principal_paid = 500.0
            advance_applied = 500.0
        elif member_id == "NSF006":
            # Paid ৳510 on 2024-12-09: ৳500 Dec principal + ৳10 Nov penalty
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PENALTY", "amount": 10.0})
            dec_principal_paid = 500.0
        elif member_id == "NSF009":
            # Paid ৳6,500 on 2024-12-11: Took another share (now 2 shares) & paid at once for all 12 months
            for m in range(1, 12):
                custom_allocations.append({"target_month": f"2024-{m:02d}", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            dec_principal_paid = 1000.0
        elif member_id == "NSF011":
            # Paid ৳2,030 on 2024-12-08: ৳1,000 Nov principal + ৳30 Nov penalty + ৳1,000 Dec principal
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PENALTY", "amount": 30.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            dec_principal_paid = 1000.0
        elif member_id == "NSF013":
            # Paid ৳1,040 on 2024-12-12: ৳40 Oct penalty + ৳1,000 Dec principal
            custom_allocations.append({"target_month": "2024-10", "allocation_type": "PENALTY", "amount": 40.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            dec_principal_paid = 1000.0
        elif member_id == "NSF015":
            # Paid ৳3,100 on 2024-12-14: ৳500 each for July-Dec (৳3,000 principal) + ৳100 July-Dec penalty
            for m in range(7, 13):
                custom_allocations.append({"target_month": f"2024-{m:02d}", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-07", "allocation_type": "PENALTY", "amount": 100.0})
            dec_principal_paid = 500.0
        elif member_id == "NSF021":
            # Paid ৳2,040 on 2024-12-15: ৳1,000 Nov principal + ৳40 Nov penalty + ৳1,000 Dec principal
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PENALTY", "amount": 40.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            dec_principal_paid = 1000.0
        elif member_id == "NSF023":
            # Paid ৳3,130 on 2025-01-01: Paid May cash out charge 10 tk + June-Dec principal (3,000) + penalty (120)
            for m in range(7, 13):
                custom_allocations.append({"target_month": f"2024-{m:02d}", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-06", "allocation_type": "PENALTY", "amount": 120.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "ADVANCE", "amount": 10.0})
            dec_principal_paid = 500.0
        elif member_id == "NSF024":
            # Paid ৳1,020 on 2024-12-01: ৳500 Nov principal + ৳20 Nov penalty + ৳500 Dec principal
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PENALTY", "amount": 20.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            dec_principal_paid = 500.0
        elif member_id == "NSF030":
            # Paid ৳2,040 on 2024-12-24: ৳1,000 Nov principal + ৳40 Nov penalty + ৳1,000 Dec principal
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PENALTY", "amount": 40.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            dec_principal_paid = 1000.0
            penalty_due = 40.0
            penalty_paid = 0.0
        elif member_id == "NSF033":
            # Paid ৳2,100 on 2024-12-13: ৳1,000 Nov principal + ৳100 penalty + ৳1,000 Dec principal
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2024-11", "allocation_type": "PENALTY", "amount": 100.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            dec_principal_paid = 1000.0
        elif member_id == "NSF034":
            # Paid ৳6,000 on 2024-12-30: ৳3,000 past arrear principal + ৳3,000 Dec principal. All clear.
            custom_allocations.append({"target_month": "2024-04", "allocation_type": "PRINCIPAL", "amount": 3000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 3000.0})
            dec_principal_paid = 3000.0
        elif received > 0:
            dec_principal_paid = min(principal_due, received)
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": dec_principal_paid})
        else:
            dec_principal_paid = 0.0
            penalty_due = source_penalty if member_id in ("NSF007", "NSF012", "NSF019", "NSF020", "NSF022", "NSF025", "NSF027", "NSF032") else (shares * 20.0)

        ref = f"HIST-2024-12-R{row:02d}"

        ledgers.append({
            "source_ref": ref,
            "member_id": member_id,
            "member_name": name,
            "month": MONTH,
            "share_count": int(shares),
            "principal_due": principal_due,
            "principal_paid": dec_principal_paid,
            "penalty_due": penalty_due,
            "penalty_paid": penalty_paid,
            "advance_applied": advance_applied,
            "excess_advance": excess_advance,
            "status": "PAID" if dec_principal_paid >= principal_due and penalty_due == penalty_paid else ("PARTIAL" if (dec_principal_paid > 0 or penalty_paid > 0) else "DUE"),
            "comment": comment,
        })

        if received > 0:
            pref = f"PAY-2024-12-R{row:02d}"
            payments.append({
                "payment_ref": pref,
                "source_ref": ref,
                "member_id": member_id,
                "member_name": name,
                "payment_date": value(ws.cell(row, 7).value),
                "total_amount": received,
                "gateway": gateway(ws.cell(row, 5).value),
                "receiver_source": value(ws.cell(row, 6).value).capitalize(),
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
    }
    (OUT / "verification-summary.json").write_text(json.dumps(verification, indent=2), encoding="utf-8")
    print(json.dumps(verification, indent=2))


if __name__ == "__main__":
    main()
