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
        "Prefer": "resolution=merge-duplicates,return=representation"
    }

    try:
        req_data = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as resp:
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
        indices = today_data.get("indices", [])
        nepse_idx = next((idx for idx in indices if idx.get("indicesName") == "NEPSE"), None)
        if nepse_idx:
            market_rec = {
                "date": today_date,
                "nepse_index": float(nepse_idx.get("value", 0.0)),
                "point_change": float(nepse_idx.get("pointChange", 0.0)),
                "percentage_change": float(nepse_idx.get("percentageChange", 0.0)),
                "total_turnover": float(nepse_idx.get("turnover", 0.0)),
                "total_volume": int(nepse_idx.get("sharesTraded", 0)),
                "total_transactions": sum(int(st.get("transactions", 0) or 0) for st in stocks),
                "advancers": int(nepse_idx.get("advancers", 0)),
                "decliners": int(nepse_idx.get("decliners", 0)),
                "unchanged": int(nepse_idx.get("unchanged", 0))
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
            fund_batch.append({
                "symbol": symbol.upper().strip(),
                "quarter": f_rec.get("quarter", "Q3 2080/81"),
                "eps": float(f_rec.get("eps", 0.0)),
                "book_value": float(f_rec.get("book_value", 0.0)),
                "pe_ratio": float(f_rec.get("pe_ratio", 0.0)),
                "pb_ratio": float(f_rec.get("pb_ratio", 0.0)),
                "roe_pct": float(f_rec.get("roe_pct", 0.0)),
                "market_cap": float(f_rec.get("market_cap", 0.0)),
                "fair_value": float(f_rec.get("fair_value", 0.0)),
                "upside_pct": float(f_rec.get("upside_pct", 0.0)),
                "ai_score": int(f_rec.get("ai_score", 80)),
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
            share_batch.append({
                "symbol": sym,
                "total_shares": int(s_rec.get("total_shares", 0)),
                "promoter_shares": int(s_rec.get("promoter_shares", 0)),
                "public_shares": int(s_rec.get("public_shares", 0)),
                "promoter_pct": float(s_rec.get("promoter_pct", 0.0)),
                "public_pct": float(s_rec.get("public_pct", 0.0)),
                "float_shares": int(s_rec.get("float_shares", 0)),
                "locked_shares": int(s_rec.get("locked_shares", 0)),
                "is_permanently_locked": bool(s_rec.get("is_permanently_locked", False)),
                "lockin_reason": s_rec.get("lockin_reason", ""),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })

            lockin_info = s_rec.get("lockin_tracker")
            if lockin_info:
                lockin_batch.append({
                    "symbol": sym,
                    "event_type": "Promoter Lock-in Expiry",
                    "expiry_date": lockin_info.get("expiry_date", "2026-12-31"),
                    "shares_unlocking": int(lockin_info.get("shares_unlocking", 0)),
                    "market_value": float(lockin_info.get("market_value", 0.0)),
                    "expected_selling_pressure": lockin_info.get("expected_selling_pressure", "Low"),
                    "status": lockin_info.get("status", "Upcoming"),
                    "days_remaining": int(lockin_info.get("days_remaining", 0))
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
