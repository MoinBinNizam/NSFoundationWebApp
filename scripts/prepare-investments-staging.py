"""Create a reviewable Historical Investments import manifest.

The source workbook (Investment.xlsx) is never changed.
All 19 historical investment projects across GrowUp, Hungry Birds Barisal, and Zayn Farm
are normalized with partner details, funding channels (Moin custody, Samrat custody, Partner wallets),
and maturity return records.
"""
from __future__ import annotations

import csv
import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl

SOURCE_XLSX = Path("docs/import-historical-evidence/Investment.xlsx")
REVIEW_CSV = Path("docs/import-historical-evidence/normalized-manifests/investment-manifest-review.csv")
OUT_DIR = Path("docs/import-historical-evidence/normalized-manifests/investments-staging")


def to_date_str(val: Any) -> str:
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, str) and val.strip():
        return val.strip()[:10]
    return ""


def to_float(val: Any) -> float:
    try:
        return float(val) if val is not None and str(val).strip() != "" else 0.0
    except (TypeError, ValueError):
        return 0.0


def determine_category(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ["banaa", "banana", "sugar cane", "papaya", "maize", "farming", "onion"]):
        return "Agriculture"
    if any(k in n for k in ["cow", "cattle", "goat", "livestock"]):
        return "Livestock"
    if any(k in n for k in ["fish"]):
        return "Fisheries"
    if any(k in n for k in ["land trading"]):
        return "Land & Property"
    if any(k in n for k in ["restaurant"]):
        return "Food & Beverage"
    if any(k in n for k in ["export", "stock", "trading"]):
        return "Commodity Trading"
    return "General Agriculture"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(SOURCE_XLSX, data_only=True)
    ws = wb["Investment"]

    # Read review CSV for funding breakdown by Moin, Samrat, Wallet
    funding_breakdowns: dict[int, dict[str, Any]] = {}
    if REVIEW_CSV.exists():
        with open(REVIEW_CSV, mode="r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                s = row.get("source_serial")
                if s and s != "20.0":
                    sl = int(float(s))
                    funding_breakdowns[sl] = {
                        "paid_by_moin": to_float(row.get("paid_by_moin")),
                        "paid_by_samrat": to_float(row.get("paid_by_samrat")),
                        "paid_by_wallet": to_float(row.get("paid_by_wallet")),
                        "gateway_normalized": row.get("gateway_normalized", "").strip(),
                        "sent_to": row.get("sent_to", "").strip(),
                    }

    projects = []
    total_funded_all = 0.0
    moin_funded_all = 0.0
    samrat_funded_all = 0.0
    wallet_funded_all = 0.0
    returns_all = []

    for r in range(3, 22):
        sl_val = ws.cell(r, 1).value
        if sl_val is None:
            continue
        sl = int(float(sl_val))
        inv_to = str(ws.cell(r, 2).value or "").strip()
        inv_no = str(ws.cell(r, 3).value or "").strip()
        pay_date = to_date_str(ws.cell(r, 4).value)
        amt = to_float(ws.cell(r, 5).value)
        s_date = to_date_str(ws.cell(r, 6).value) or pay_date
        e_date = to_date_str(ws.cell(r, 7).value)
        raw_name = str(ws.cell(r, 8).value or "").strip()
        dur = str(ws.cell(r, 9).value or "").strip()
        status_raw = str(ws.cell(r, 12).value or "").strip()
        org_raw = str(ws.cell(r, 13).value or "").strip().rstrip(".")
        roi = to_float(ws.cell(r, 14).value)

        status = "MATURED" if status_raw.lower() == "matured" else "ACTIVE"
        category = determine_category(raw_name)
        project_id = f"PRJ-{sl:02d}"

        breakdown = funding_breakdowns.get(sl, {})
        moin_amt = breakdown.get("paid_by_moin", 0.0)
        samrat_amt = breakdown.get("paid_by_samrat", 0.0)
        wallet_amt = breakdown.get("paid_by_wallet", 0.0)

        # Fallback if review CSV missing
        if moin_amt == 0 and samrat_amt == 0 and wallet_amt == 0:
            moin_amt = amt

        fundings = []
        if moin_amt > 0:
            fundings.append({
                "source": "MOIN_CUSTODY",
                "channel": "BANK" if "bank" in breakdown.get("gateway_normalized", "").lower() else "BKASH",
                "amount": moin_amt,
                "notes": f"Historical funding from Moin custody ({breakdown.get('gateway_normalized', 'Bank')})",
            })
        if samrat_amt > 0:
            fundings.append({
                "source": "SAMRAT_CUSTODY",
                "channel": "NAGAD" if "nagad" in breakdown.get("gateway_normalized", "").lower() else "BKASH",
                "amount": samrat_amt,
                "notes": f"Historical funding from Samrat custody ({breakdown.get('gateway_normalized', 'Nagad')})",
            })
        if wallet_amt > 0:
            fundings.append({
                "source": "PARTNER_WALLET",
                "channel": "WALLET",
                "amount": wallet_amt,
                "notes": f"Historical reinvestment from {org_raw} Partner Wallet",
            })

        project_returns = []
        if status == "MATURED" or roi > 0:
            project_returns.append({
                "maturityDate": e_date,
                "principalReturned": amt,
                "actualProfit": roi,
                "actualLoss": 0.0,
                "totalReturn": amt + roi,
                "destinationType": "EXTERNAL_WALLET" if sl not in [3, 5] else "ACCOUNTANT_CUSTODY",
                "notes": f"Historical return recorded for {raw_name} per authoritative Investment workbook.",
            })
            returns_all.append({
                "projectId": project_id,
                "projectName": raw_name,
                "principalReturned": amt,
                "actualProfit": roi,
                "totalReturn": amt + roi,
            })

        total_funded_all += amt
        moin_funded_all += moin_amt
        samrat_funded_all += samrat_amt
        wallet_funded_all += wallet_amt

        projects.append({
            "sourceRow": r,
            "serialNo": sl,
            "projectId": project_id,
            "name": raw_name,
            "invoiceNo": inv_no,
            "invoiceTo": inv_to,
            "category": category,
            "externalEntity": org_raw,
            "startDate": s_date,
            "maturityDate": e_date,
            "duration": dur,
            "targetPrincipal": amt,
            "totalFunded": amt,
            "expectedROI": roi if roi > 0 else None,
            "status": status,
            "fundings": fundings,
            "returns": project_returns,
        })

    manifest = {
        "projects": projects,
        "metadata": {
            "sourceFile": "Investment.xlsx",
            "sourceSheet": "Investment",
            "totalProjects": len(projects),
            "maturedProjects": sum(1 for p in projects if p["status"] == "MATURED"),
            "activeProjects": sum(1 for p in projects if p["status"] == "ACTIVE"),
            "totalTargetPrincipal": total_funded_all,
            "totalFunded": total_funded_all,
            "fundingDistribution": {
                "moinCustody": moin_funded_all,
                "samratCustody": samrat_funded_all,
                "partnerWallets": wallet_funded_all,
            },
            "totalRealizedProfit": sum(r["actualProfit"] for r in returns_all),
            "totalReturned": sum(r["totalReturn"] for r in returns_all),
        },
    }

    (OUT_DIR / "staging-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    verification = {
        "totalProjects": len(projects),
        "totalTargetPrincipal": total_funded_all,
        "totalFunded": total_funded_all,
        "moinCustodyFunded": moin_funded_all,
        "samratCustodyFunded": samrat_funded_all,
        "partnerWalletFunded": wallet_funded_all,
        "maturedCount": sum(1 for p in projects if p["status"] == "MATURED"),
        "activeCount": sum(1 for p in projects if p["status"] == "ACTIVE"),
        "totalProfitRealized": sum(r["actualProfit"] for r in returns_all),
        "totalReturnEvents": len(returns_all),
    }

    (OUT_DIR / "verification-summary.json").write_text(json.dumps(verification, indent=2), encoding="utf-8")
    print(json.dumps(verification, indent=2))


if __name__ == "__main__":
    main()
