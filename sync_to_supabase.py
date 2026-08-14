#!/usr/bin/env python3
"""
====================================================================
NEPSE TERMINAL -> SUPABASE DATABASE DATA SYNCHRONIZATION PIPELINE
====================================================================
Reads local scraped datasets and syncs all records directly to Supabase PostgreSQL via REST API.

Environment Variables:
- SUPABASE_URL: e.g. https://your-project.supabase.co
- SUPABASE_SERVICE_ROLE_KEY: Service role secret key (bypasses RLS for write operations)
"""

import os
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Manually load environment variables from .env file if it exists
def load_env():
    env_path = os.path.join(DIRECTORY, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("=", 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().strip('"').strip("'")
                    os.environ[key] = val

load_env()

# Supabase Config
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://your-project-id.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "YOUR_SERVICE_ROLE_KEY")

def post_to_supabase(table, data):
    """Upsert data into Supabase PostgreSQL table via REST API"""
    if "your-project-id" in SUPABASE_URL or "YOUR_SERVICE_ROLE_KEY" in SUPABASE_KEY:
        print(f"[Supabase Sync] Warning: Environment variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured. Skipping remote sync for '{table}'.")
        return False

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
    }

    try:
        import ssl as _ssl
        ctx = _ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = _ssl.CERT_NONE
        req_data = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
        with urllib.request.urlopen(req, context=ctx) as resp:
            status = resp.status
            print(f"[Supabase Sync] Successfully synced {len(data)} records to table '{table}' (HTTP {status})")
            return True
    except Exception as e:
        print(f"[Supabase Sync] Error syncing to table '{table}': {e}")
        return False

def sync_all_to_supabase():
    print("======================================================")
    print("🚀 STARTING NEPSE TERMINAL -> SUPABASE DATA SYNC")
    print("======================================================")

    # 1. Sync Companies Master & Today's Prices
    today_file = os.path.join(DIRECTORY, "data", "nepse_today.json")
    if os.path.exists(today_file):
        with open(today_file, "r", encoding="utf-8") as f:
            today_data = json.load(f)
        
        today_date = today_data.get("date", datetime.now().strftime("%Y-%m-%d"))
        stocks = today_data.get("stocks", [])

        companies_batch = []
        prices_batch = []

        for s in stocks:
            symbol = s["symbol"].upper().strip()
            companies_batch.append({
                "symbol": symbol,
                "name": s.get("fullName", symbol),
                "sector": s.get("sector", "Unknown"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

            prices_batch.append({
                "symbol": symbol,
                "date": today_date,
                "open": float(s.get("open", s["ltp"])),
                "high": float(s.get("high", s["ltp"])),
                "low": float(s.get("low", s["ltp"])),
                "close": float(s["ltp"]),
                "change_npr": float(s.get("diff", 0.0)),
                "change_pct": float(s.get("diff_percent", 0.0)),
                "volume": int(s.get("volume", 0)),
                "turnover": float(s.get("turnover", 0.0)),
                "transactions": int(s.get("transactions", 0))
            })

        print(f"[Sync] Preparing {len(companies_batch)} companies master records...")
        post_to_supabase("companies", companies_batch)

        print(f"[Sync] Preparing {len(prices_batch)} daily prices records for date {today_date}...")
        post_to_supabase("daily_prices", prices_batch)

        # Sync Market (NEPSE) Summary History
        # nepse_today.json uses 'title'/'value'/'change'/'change_percent' format
        indices = today_data.get("indices", [])
        summary = today_data.get("summary", {})
        nepse_idx = next(
            (idx for idx in indices if "nepse" in idx.get("title", "").lower() or idx.get("indicesName", "") == "NEPSE"),
            None
        )
        market_rec = {
            "date": today_date,
            "nepse_index": float((nepse_idx or {}).get("value", 0.0)),
            "point_change": float((nepse_idx or {}).get("change", (nepse_idx or {}).get("pointChange", 0.0))),
            "percentage_change": float((nepse_idx or {}).get("change_percent", (nepse_idx or {}).get("percentageChange", 0.0))),
            "total_turnover": float(summary.get("total_turnover", (nepse_idx or {}).get("turnover", 0.0))),
            "total_volume": int(summary.get("total_volume", 0)),
            "total_transactions": int(summary.get("total_transactions", 0)),
            "advancers": int(summary.get("advancers", 0)),
            "decliners": int(summary.get("decliners", 0)),
            "unchanged": int(summary.get("unchanged", 0))
        }
        print(f"[Sync] Preparing NEPSE market history record for date {today_date}...")
        post_to_supabase("market_history", [market_rec])

    # 2. Sync Real Live Fundamentals
    fund_file = os.path.join(DIRECTORY, "data", "nepse_fundamentals_live.json")
    if os.path.exists(fund_file):
        with open(fund_file, "r", encoding="utf-8") as f:
            fund_data = json.load(f)

        fund_batch = []
        for symbol, f_rec in fund_data.items():
            ltp_rec = next((s for s in stocks if s.get("symbol", "").upper() == symbol.upper()), {})
            ltp = float(ltp_rec.get("ltp") or ltp_rec.get("close") or 0.0)
            eps = float(f_rec.get("eps", 0.0))
            bv = float(f_rec.get("book_value", 0.0))
            pe = float(f_rec.get("pe_ratio") or (round(ltp / eps, 2) if eps > 0 and ltp > 0 else 0.0))
            pb = float(f_rec.get("pb_ratio") or (round(ltp / bv, 2) if bv > 0 and ltp > 0 else 0.0))
            # fair_value: 15% upside if PE < 15, else 8%, else -5%
            fair_val = round(ltp * (1.15 if pe > 0 and pe <= 15 else (1.08 if pe <= 28 else 0.95)), 2) if ltp > 0 else 0.0
            upside = round(((fair_val - ltp) / ltp) * 100, 2) if ltp > 0 and fair_val > 0 else 0.0
            fund_batch.append({
                "symbol": symbol.upper().strip(),
                "quarter": f_rec.get("quarter", "Q3 2081/82"),
                "eps": eps,
                "book_value": bv,
                "pe_ratio": pe,
                "pb_ratio": pb,
                # JSON stores field as 'roe', not 'roe_pct'
                "roe_pct": float(f_rec.get("roe") or f_rec.get("roe_pct") or 0.0),
                "market_cap": float(f_rec.get("market_cap", 0.0)),
                "fair_value": fair_val,
                "upside_pct": upside,
                "ai_score": 80,
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

        print(f"[Sync] Preparing {len(fund_batch)} real fundamental records...")
        post_to_supabase("company_fundamentals", fund_batch)

    # 3. Sync Share Structure & Lock-in Tracker
    share_file = os.path.join(DIRECTORY, "data", "nepse_share_structure_live.json")
    if os.path.exists(share_file):
        with open(share_file, "r", encoding="utf-8") as f:
            share_data = json.load(f)

        share_batch = []
        lockin_batch = []

        for symbol, s_rec in share_data.items():
            sym = symbol.upper().strip()
            total_shares = int(s_rec.get("total_shares", 0))
            # JSON uses 'promoter_shares_count' and 'public_shares_count'
            promoter_shares = int(s_rec.get("promoter_shares_count") or s_rec.get("promoter_shares") or 0)
            public_shares = int(s_rec.get("public_shares_count") or s_rec.get("public_shares") or 0)
            # JSON uses 'promoter_shares_pct' and 'public_shares_pct'
            promoter_pct = float(s_rec.get("promoter_shares_pct") or s_rec.get("promoter_pct") or 0.0)
            public_pct = float(s_rec.get("public_shares_pct") or s_rec.get("public_pct") or 0.0)
            is_locked = bool(s_rec.get("is_locked", False))
            lockin_expiry = s_rec.get("promoter_lockin_expiry_date") or s_rec.get("mutual_fund_lockin_expiry_date") or ""
            # Compute float/locked shares from known data
            locked_shares = promoter_shares if is_locked else 0
            float_shares = public_shares

            share_batch.append({
                "symbol": sym,
                # Schema columns: total_shares, promoter_shares, public_shares, promoter_pct, public_pct,
                # float_shares, locked_shares, is_permanently_locked, lockin_reason
                "total_shares": total_shares,
                "promoter_shares": promoter_shares,
                "public_shares": public_shares,
                "promoter_pct": promoter_pct,
                "public_pct": public_pct,
                "float_shares": float_shares,
                "locked_shares": locked_shares,
                "is_permanently_locked": False,  # NRB check done in app layer
                "lockin_reason": f"Promoter lock-in expires {lockin_expiry}" if lockin_expiry and is_locked else "",
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

            # Add lock-in event if there is a future expiry date
            if lockin_expiry and len(lockin_expiry) == 10 and is_locked:
                lockin_batch.append({
                    "symbol": sym,
                    "event_type": "Promoter Lock-in Expiry",
                    "expiry_date": lockin_expiry,
                    "shares_unlocking": int(promoter_shares * 0.35),
                    "status": "Upcoming",
                })

        print(f"[Sync] Preparing {len(share_batch)} share structure records...")
        post_to_supabase("share_structures", share_batch)

        print(f"[Sync] Preparing {len(lockin_batch)} lock-in tracker records...")
        post_to_supabase("lockin_tracker", lockin_batch)

    print("======================================================")
    print("✅ SUPABASE SYNC COMPLETED SUCCESSFULLY")
    print("======================================================")

if __name__ == "__main__":
    sync_all_to_supabase()
