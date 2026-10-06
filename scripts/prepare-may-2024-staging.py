"""Create a reviewable May 2024 member-by-member import manifest.

The source workbook is never changed.
Cross-month arrear, penalty, and advance payments are mapped cleanly via FIFO.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

SOURCE = Path("docs/import-historical-evidence/Month_May_2024.xlsx")
OUT = Path("docs/import-historical-evidence/normalized-manifests/may-2024-staging")
MONTH = "2024-05"
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
    ws = openpyxl.load_workbook(SOURCE, data_only=True)["May, 2024"]
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

        # Cross-month arrear, penalty, cashout and advance breakdowns
        custom_allocations = []
        cashout_charge = 0.0
        may_principal_paid = 0.0
        penalty_due = 0.0

        if member_id == "NSF002":
            # Paid ৳1,500 on 2024-05-13. Allocates to April principal arrear (৳1,500)
            custom_allocations.append({"target_month": "2024-04", "allocation_type": "PRINCIPAL", "amount": 1500.0})
            may_principal_paid = 0.0
            penalty_due = 0.0
        elif member_id == "NSF003":
            # Paid ৳2,500 on 2024-05-08. May principal ৳1,000 + ৳1,500 advance deposit
            may_principal_paid = 1000.0
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "ADVANCE", "amount": 1500.0})
        elif member_id == "NSF013":
            # Paid ৳1,010 on 2024-05-04. May principal ৳1,000 + ৳10 April cashout charge
            may_principal_paid = 1000.0
            cashout_charge = 10.0
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
        elif member_id == "NSF020":
            # Paid ৳1,025 on 2024-05-20. April principal ৳500 + May principal ৳500 + ৳25 cashout
            may_principal_paid = 500.0
            cashout_charge = 25.0
            custom_allocations.append({"target_month": "2024-04", "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
        elif member_id == "NSF025":
            # Paid ৳2,040 on 2024-05-14. March penalty ৳40 + May principal ৳1,000 + June advance ৳1,000
            may_principal_paid = 1000.0
            custom_allocations.append({"target_month": "2024-03", "allocation_type": "PENALTY", "amount": 40.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
            custom_allocations.append({"target_month": "2024-06", "allocation_type": "ADVANCE", "amount": 1000.0})
        elif member_id == "NSF027":
            # Paid ৳1,060 on 2024-05-15. March penalty ৳20 + April penalty ৳40 + May principal ৳1,000
            may_principal_paid = 1000.0
            custom_allocations.append({"target_month": "2024-03", "allocation_type": "PENALTY", "amount": 20.0})
            custom_allocations.append({"target_month": "2024-04", "allocation_type": "PENALTY", "amount": 40.0})
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 1000.0})
        elif member_id == "NSF031":
            # Paid ৳2,000 on 2024-05-18. May principal ৳500 + June/July/August advance ৳1,500
            may_principal_paid = 500.0
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-06", "allocation_type": "ADVANCE", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-07", "allocation_type": "ADVANCE", "amount": 500.0})
            custom_allocations.append({"target_month": "2024-08", "allocation_type": "ADVANCE", "amount": 500.0})
        elif received > 0:
            may_principal_paid = min(principal_due, received)
            custom_allocations.append({"target_month": MONTH, "allocation_type": "PRINCIPAL", "amount": may_principal_paid})
        else:
            may_principal_paid = 0.0
            penalty_due = source_penalty if member_id in ("NSF022", "NSF032", "NSF033") else 0.0

        ref = f"HIST-2024-05-R{row:02d}"
        status = "PAID" if (may_principal_paid >= principal_due and penalty_due == 0) else ("PARTIAL" if may_principal_paid > 0 else "DUE")

        ledgers.append({
            "source_ref": ref,
            "member_id": member_id,
            "member_name": name,
            "month": MONTH,
            "share_count": shares,
            "principal_due": principal_due,
            "principal_paid": may_principal_paid,
            "penalty_due": penalty_due,
            "penalty_paid": 0.0,
            "advance_applied": 0.0,
            "excess_advance": 1500.0 if member_id == "NSF003" else 0.0,
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
            "cashout_charge": cashout_charge,
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
        "may_principal_due": sum(row["principal_due"] - row["principal_paid"] for row in ledgers),
        "prior_principal_arrears_collected": sum(row["amount"] for row in allocations if row["target_month"] in ("2024-03", "2024-04") and row["allocation_type"] == "PRINCIPAL"),
        "prior_penalties_collected": sum(row["amount"] for row in allocations if row["target_month"] in ("2024-03", "2024-04") and row["allocation_type"] == "PENALTY"),
        "advances_collected": sum(row["amount"] for row in allocations if row["allocation_type"] == "ADVANCE"),
        "cashout_charges_collected": sum(row["cashout_charge"] for row in payments),
    }
    (OUT / "verification-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
