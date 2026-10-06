"""Create a reviewable November 2024 member-by-member import manifest.

The source workbook is never changed.
Cross-month FIFO arrear and advance allocations for NSF008, NSF016, NSF028, NSF031, NSF034, and NSF035 are resolved cleanly.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

SOURCE = Path("docs/import-historical-evidence/Month_November_2024.xlsx")
OUT = Path("docs/import-historical-evidence/normalized-manifests/november-2024-staging")
MONTH = "2024-11"
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
    ws = openpyxl.load_workbook(SOURCE, data_only=True)["Nov, 2024"]
    ledgers, payments, allocations = [], [], []

    for row in range(3, 38):
        member_id = value(ws.cell(row, 1).value).upper()
        if not member_id.startswith("NSF"):
            continue
        name, shares = value(ws.cell(row, 2).value), number(ws.cell(row, 3).value)
        raw_amount = ws.cell(row, 4).value
        source_due, source_penalty = number(ws.cell(row, 8).value), number(ws.cell(row, 9).value)
        comment = value(ws.cell(row, 10).value)
        principal_due = shares * RATE
        received = number(raw_amount)

        custom_allocations = []
        nov_principal_paid = 0.0
        penalty_due = 0.0
        penalty_paid = 0.0
        advance_applied = 0.0
        excess_advance = 0.0

        if member_id == "NSF035":
            # Paid in advance in October 2024 (৳500 for Nov 2024)
            nov_principal_paid = 500.0
            advance_applied = 500.0
        elif member_id == "NSF006":
            # Paid ৳500 on 2024-11-16 (late fee unpaid per source: Due 10 tk)
            nov_principal_paid = 500.0
            penalty_due = 10.0
            penalty_paid = 0.0
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
        elif member_id == "NSF008":
            # Paid ৳510 on 2024-11-15: ৳10 Sept remaining penalty + ৳500 Nov principal
            custom_allocations.append({"target_month": "2024-09", "allocation_type": "PENALTY", "amount": 10.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            nov_principal_paid = 500.0
        elif member_id == "NSF013":
            # Paid ৳1,000 on 2024-11-16: ৳1,000 Nov principal, October penalty (40) remains unpaid
            nov_principal_paid = 1000.0
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
        elif member_id == "NSF016":
            # Paid ৳1,000 on 2024-11-06: ৳500 Oct principal + ৳500 Nov principal
            custom_allocations.append({"target_month": "2024-10", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            nov_principal_paid = 500.0
        elif member_id == "NSF028":
            # Paid ৳2,000 on 2024-11-07: ৳1,000 Nov principal + ৳1,000 Dec advance
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2024-12", "allocation_type": "ADVANCE", "amount": 1000.0})
            nov_principal_paid = 1000.0
        elif member_id == "NSF031":
            # Paid ৳2,000 on 2024-11-18: ৳500 Sept principal + ৳500 Oct principal + ৳500 Nov principal + ৳500 Dec advance
            custom_allocations.append({"target_month": "2024-09", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-10", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-12", "allocation_type": "ADVANCE", "amount": 500.0})
            nov_principal_paid = 500.0
        elif member_id == "NSF034":
            # Paid ৳3,000 on 2024-11-13: ৳3,000 Nov principal
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 3000.0})
            nov_principal_paid = 3000.0
        elif received > 0:
            nov_principal_paid = min(principal_due, received)
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": nov_principal_paid})
        else:
            nov_principal_paid = 0.0
            penalty_due = source_penalty if member_id in ("NSF007", "NSF011", "NSF012", "NSF015", "NSF019", "NSF020", "NSF021", "NSF022", "NSF023", "NSF024", "NSF025", "NSF027", "NSF030", "NSF032", "NSF033") else (shares * 20.0)

        ref = f"HIST-2024-11-R{row:02d}"

        ledgers.append({
            "source_ref": ref,
            "member_id": member_id,
            "member_name": name,
            "month": MONTH,
            "share_count": int(shares),
            "principal_due": principal_due,
            "principal_paid": nov_principal_paid,
            "penalty_due": penalty_due,
            "penalty_paid": penalty_paid,
            "advance_applied": advance_applied,
            "excess_advance": excess_advance,
            "status": "PAID" if nov_principal_paid >= principal_due and penalty_due == penalty_paid else ("PARTIAL" if (nov_principal_paid > 0 or penalty_paid > 0) else "DUE"),
            "comment": comment,
        })

        if received > 0:
            pref = f"PAY-2024-11-R{row:02d}"
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
