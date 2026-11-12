"""Read ticket sales from PayPal and write data/tickets.json for the admin page.

Each online order carries "gameId|quantity|full name" in PayPal's custom_id field
(set by js/payments.js). This script lists the account's transactions with PayPal's
Transaction Search API, keeps the ticket sales, drops refunded ones, and writes:

  data/tickets.json  {"games": {"<game id>": [{"name": "J. Smith", "qty": 2}, ...]}}

Only the first initial, last name and ticket count are written, because the site
(and so this file) is public. Emails, phone numbers and amounts stay in PayPal.

Needs these environment variables (GitHub repo secrets in the "Sync ticket sales" workflow):
  PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET   the app's API credentials
  PAYPAL_ENV                               "live" (default) or "sandbox"

PayPal can take up to about 3 hours to list a new sale in Transaction Search, and the
app must have "Transaction search" turned on in the PayPal developer dashboard.

Usage: python scripts/sync_tickets.py [data_dir]
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

TICKET_PRICE = 10.00                                  # must match js/payments.js
SALES_START = datetime(2026, 11, 1, tzinfo=timezone.utc)  # first day online sales could exist
ORDER = re.compile(r"^(\d+)\|(\d+)\|(.+)$")             # gameId|quantity|full name
SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv"}


def api_base():
    return "https://api-m.sandbox.paypal.com" if os.environ.get("PAYPAL_ENV", "").lower() == "sandbox" \
        else "https://api-m.paypal.com"


def request(url, *, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"PayPal said {err.code} for {url.split('?')[0]}: {body}") from None


def token(client_id, secret):
    auth = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    res = request(f"{api_base()}/v1/oauth2/token", data=b"grant_type=client_credentials",
                  headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"})
    return res["access_token"]


def transactions(access_token):
    """Every transaction since SALES_START, in 31-day windows (PayPal's limit).

    Windows run backwards from now, so only the newest window touches recent hours."""
    end = datetime.now(timezone.utc).replace(microsecond=0)
    fmt = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
    while end > SALES_START:
        start = max(end - timedelta(days=31) + timedelta(seconds=1), SALES_START)
        page, pages = 1, 1
        while page <= pages:
            q = urllib.parse.urlencode({"start_date": fmt(start), "end_date": fmt(end), "fields": "transaction_info",
                                        "page_size": 500, "page": page})
            res = request(f"{api_base()}/v1/reporting/transactions?{q}",
                          headers={"Authorization": f"Bearer {access_token}"})
            yield from (t["transaction_info"] for t in res.get("transaction_details", []))
            pages = res.get("total_pages", 1) or 1
            page += 1
        end = start - timedelta(seconds=1)


def short_name(full):
    """'Mary Ann Smith Jr.' -> 'M. Smith Jr.'"""
    # Capitalize words typed in all lowercase ("jane smith"), leave others ("McDonald") alone.
    words = [w[0].upper() + w[1:] if w.islower() else w for w in full.split()]
    if len(words) < 2:
        return full
    last = words[-1]
    if last.lower() in SUFFIXES and len(words) > 2:
        last = f"{words[-2]} {last}"
    return f"{words[0][0].upper()}. {last}"


def build(txns):
    sales, refunds = {}, {}
    for t in txns:
        amount = float(t.get("transaction_amount", {}).get("value", 0) or 0)
        if amount < 0 and t.get("paypal_reference_id"):
            refunds[t["paypal_reference_id"]] = refunds.get(t["paypal_reference_id"], 0) - amount
            continue
        m = ORDER.match((t.get("custom_field") or "").strip())
        if not m or amount <= 0 or t.get("transaction_status") not in ("S", "P"):
            continue
        sales[t["transaction_id"]] = {
            "game": m.group(1), "qty": int(m.group(2)), "name": short_name(m.group(3).strip()),
            "amount": amount, "pending": t.get("transaction_status") == "P",
            "when": t.get("transaction_initiation_date", ""),
        }

    games = {}
    for tid, s in sorted(sales.items(), key=lambda kv: kv[1]["when"]):
        refunded = refunds.get(tid, 0)
        if refunded >= s["amount"] - 0.005:
            continue  # fully refunded
        row = {"name": s["name"], "qty": s["qty"]}
        notes = []
        expected = s["qty"] * TICKET_PRICE
        if abs(s["amount"] - expected) > 0.005:
            notes.append(f"paid ${s['amount']:.2f}, expected ${expected:.2f}")
        if refunded:
            notes.append(f"${refunded:.2f} refunded")
        if s["pending"]:
            notes.append("payment pending")
        if notes:
            row["note"] = "; ".join(notes)
        games.setdefault(s["game"], []).append(row)
    return {"games": games}


def main():
    data_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "data")
    client_id, secret = os.environ.get("PAYPAL_CLIENT_ID"), os.environ.get("PAYPAL_CLIENT_SECRET")
    if not client_id or not secret:
        print("PayPal credentials aren't set up yet (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET); nothing to do.")
        return
    data = build(transactions(token(client_id, secret)))

    path = data_dir / "tickets.json"
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if {k: v for k, v in old.items() if k != "updated"} == data:
        print("tickets.json: no changes")
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    data_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"updated": now, **data}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sold = sum(r["qty"] for rows in data["games"].values() for r in rows)
    print(f"tickets.json: updated ({sold} tickets)")


if __name__ == "__main__":
    main()
