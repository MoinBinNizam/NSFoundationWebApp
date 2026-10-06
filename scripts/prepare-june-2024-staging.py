"""Create a reviewable June 2024 member-by-member import manifest.

The source workbook is never changed.
Advances paid in May for NSF025 and NSF031 are applied to June.
Cross-month FIFO arrear allocations for NSF002 and NSF034 are resolved cleanly.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

SOURCE = Path("docs/import-historical-evidence/Month_June_2024.xlsx")
OUT = Path("docs/import-historical-evidence/normalized-manifests/june-2024-staging")
MONTH = "2024-06"
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
    ws = openpyxl.load_workbook(SOURCE, data_only=True)["June, 2024"]
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
        paid_in_advance = value(raw_amount).lower() == "paid" and ("advanced" in comment.lower() or "may" in comment.lower())
        received = number(raw_amount)

        custom_allocations = []
        june_principal_paid = 0.0
        penalty_due = 0.0

        if member_id == "NSF002":
            # Paid ৳3,060 on 2024-06-10:
            # ৳500 April principal arrear + ৳60 April penalty + ৳1,500 May principal arrear + ৳1,000 June principal
            custom_allocations.append({"target_month": "2024-04", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-04", "allocation_type": "PENALTY", "amount": 60.0})
            custom_allocations.append({"target_month": "2024-05", "allocation_type": "PRINCIPAL", "amount": 1500.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            june_principal_paid = 1000.0
            penalty_due = 0.0
        elif member_id == "NSF034":
            # Paid ৳3,000 on 2024-06-02. Under FIFO, settles oldest unpaid month: January 2024 principal arrear
            custom_allocations.append({"target_month": "2024-01", "allocation_type": "PRINCIPAL", "amount": 3000.0})
            june_principal_paid = 0.0
            penalty_due = 0.0
        elif paid_in_advance:
            # Paid via May advance (NSF025: ৳1,000, NSF031: ৳500)
            june_principal_paid = principal_due
            penalty_due = 0.0
        elif received > 0:
            june_principal_paid = min(principal_due, received)
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": june_principal_paid})
        else:
            june_principal_paid = 0.0
            penalty_due = source_penalty if member_id in ("NSF008", "NSF012", "NSF013", "NSF020", "NSF022", "NSF023", "NSF027", "NSF032", "NSF033") else 0.0

        ref = f"HIST-2024-06-R{row:02d}"
        status = "PAID" if (june_principal_paid >= principal_due and penalty_due == 0) else ("PARTIAL" if june_principal_paid > 0 else "DUE")

        ledgers.append({
            "source_ref": ref,
            "member_id": member_id,
            "member_name": name,
            "month": MONTH,
            "share_count": shares,
            "principal_due": principal_due,
            "principal_paid": june_principal_paid,
            "penalty_due": penalty_due,
            "penalty_paid": 0.0,
            "advance_applied": june_principal_paid if paid_in_advance else 0.0,
            "excess_advance": 0.0,
            "status": status,
            "source_row": row,
            "comment": comment
        })

        if received <= 0:
            continue

        payment_ref = f"{ref}-P01"
        payments.append({
            "payment_ref": payment_ref,
            "source_ref": ref,
            "member_id": member_id,
            "member_name": name,
            "payment_date": value(ws.cell(row, 7).value),
            "total_amount": received,
            "gateway": gateway(ws.cell(row, 5).value),
            "receiver_source": value(ws.cell(row, 6).value),
            "comment": comment
        })

        for alloc in custom_allocations:
            allocations.append({
                "payment_ref": payment_ref,
                "member_id": member_id,
                "target_month": alloc["target_month"],
                "allocation_type": alloc["allocation_type"],
                "amount": alloc["amount"],
                "source_ref": ref
            })

    manifest = {"ledgers": ledgers, "payments": payments, "allocations": allocations}
    (OUT / "staging-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    summary = {
        "members": len(ledgers),
        "payments": len(payments),
        "allocations": len(allocations),
        "cash_received": sum(row["total_amount"] for row in payments),
        "june_principal_due": sum(row["principal_due"] - row["principal_paid"] for row in ledgers),
        "prior_principal_arrears_collected": sum(row["amount"] for row in allocations if row["target_month"] < MONTH and row["allocation_type"] == "PRINCIPAL"),
        "prior_penalties_collected": sum(row["amount"] for row in allocations if row["target_month"] < MONTH and row["allocation_type"] == "PENALTY"),
        "advances_applied": sum(row["advance_applied"] for row in ledgers),
    }
    (OUT / "verification-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
