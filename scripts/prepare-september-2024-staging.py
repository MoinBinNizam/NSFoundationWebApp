"""Create a reviewable September 2024 member-by-member import manifest.

The source workbook is never changed.
Cross-month FIFO arrear and advance allocations for NSF001, NSF005, NSF016, and NSF021 are resolved cleanly.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

SOURCE = Path("docs/import-historical-evidence/Month_September_2024.xlsx")
OUT = Path("docs/import-historical-evidence/normalized-manifests/september-2024-staging")
MONTH = "2024-09"
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
    ws = openpyxl.load_workbook(SOURCE, data_only=True)["Sept, 2024"]
    ledgers, payments, allocations = [], [], []

    for row in range(3, 38):
        member_id = value(ws.cell(row, 1).value).upper()
        if not member_id.startswith("NSF"):
            continue
        name, shares = value(ws.cell(row, 2).value), number(ws.cell(row, 3).value)
        raw_amount = ws.cell(row, 4).value
        source_due, source_penalty = number(ws.cell(row, 8).value), number(ws.cell(row, 9).value)
        # Note: comments in September workbook are placed in column 11
        comment = value(ws.cell(row, 11).value) or value(ws.cell(row, 10).value)
        principal_due = shares * RATE
        received = number(raw_amount)

        custom_allocations = []
        sept_principal_paid = 0.0
        penalty_due = 0.0
        penalty_paid = 0.0
        excess_advance = 0.0

        if member_id == "NSF001":
            # Paid ৳2,600 on 2024-09-18: ৳2,500 September principal + ৳100 September penalty
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 2500.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PENALTY", "amount": 100.0})
            sept_principal_paid = 2500.0
            penalty_due = 100.0
            penalty_paid = 100.0
        elif member_id == "NSF005":
            # Paid ৳3,070 on 2024-09-18:
            # ৳1,000 August principal + ৳1,000 September principal + ৳40 September penalty + ৳1,000 October advance + ৳30 excess advance
            custom_allocations.append({"target_month": "2024-08", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PENALTY", "amount": 40.0})
            custom_allocations.append({"target_month": "2024-10", "allocation_type": "ADVANCE", "amount": 1000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "ADVANCE", "amount": 30.0})
            sept_principal_paid = 1000.0
            penalty_due = 40.0
            penalty_paid = 40.0
            excess_advance = 30.0
        elif member_id == "NSF008":
            # Paid ৳500 on 2024-09-16 (late): ৳500 principal, ৳20 penalty due
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            sept_principal_paid = 500.0
            penalty_due = 20.0
            penalty_paid = 0.0
        elif member_id == "NSF016":
            # Paid ৳1,000 on 2024-09-12: ৳500 August principal + ৳500 September principal
            custom_allocations.append({"target_month": "2024-08", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            sept_principal_paid = 500.0
        elif member_id == "NSF021":
            # Paid ৳2,040 on 2024-09-20:
            # ৳1,000 August principal + ৳1,000 September principal + ৳40 September penalty
            custom_allocations.append({"target_month": "2024-08", "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PENALTY", "amount": 40.0})
            sept_principal_paid = 1000.0
            penalty_due = 40.0
            penalty_paid = 40.0
        elif received > 0:
            sept_principal_paid = min(principal_due, received)
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": sept_principal_paid})
        else:
            sept_principal_paid = 0.0
            penalty_due = source_penalty if member_id in ("NSF006", "NSF012", "NSF015", "NSF020", "NSF022", "NSF023", "NSF025", "NSF027", "NSF031", "NSF032", "NSF033", "NSF034") else 0.0

        ref = f"HIST-2024-09-R{row:02d}"
        status = "PAID" if (sept_principal_paid >= principal_due and (penalty_due - penalty_paid) == 0) else ("PARTIAL" if (sept_principal_paid > 0 or penalty_paid > 0) else "DUE")

        ledgers.append({
            "source_ref": ref,
            "member_id": member_id,
            "member_name": name,
            "month": MONTH,
            "share_count": shares,
            "principal_due": principal_due,
            "principal_paid": sept_principal_paid,
            "penalty_due": penalty_due,
            "penalty_paid": penalty_paid,
            "advance_applied": 0.0,
            "excess_advance": excess_advance,
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
        "september_principal_due": sum(row["principal_due"] - row["principal_paid"] for row in ledgers),
        "prior_principal_arrears_collected": sum(row["amount"] for row in allocations if row["target_month"] < MONTH and row["allocation_type"] == "PRINCIPAL"),
        "september_penalties_collected": sum(row["amount"] for row in allocations if row["target_month"] == MONTH and row["allocation_type"] == "PENALTY"),
        "advances_collected": sum(row["amount"] for row in allocations if row["allocation_type"] == "ADVANCE"),
    }
    (OUT / "verification-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
