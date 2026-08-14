#!/usr/bin/env python3
import os
import sys
import time
import json
import urllib.request
import urllib.parse
import ssl
import re
from datetime import datetime
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DIRECTORY, "data")
CACHE_DIR = os.path.join(DATA_DIR, "history_cache")
MAPPINGS_FILE = os.path.join(DATA_DIR, "company_mappings.json")

def load_symbols():
    today_json = os.path.join(DATA_DIR, "nepse_today.json")
    if not os.path.exists(today_json):
        print(f"Error: Today's NEPSE file not found at {today_json}. Run scrape.py first.")
        sys.exit(1)
    
    with open(today_json, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    stocks = data.get("stocks", [])
    symbols = [s["symbol"].upper().strip() for s in stocks]
    print(f"[Scraper] Loaded {len(symbols)} symbols from today's market data.")
    return symbols

def load_mappings():
    if os.path.exists(MAPPINGS_FILE):
        try:
            with open(MAPPINGS_FILE, "r", encoding="utf-8") as f:
                mappings = json.load(f)
                print(f"[Scraper] Loaded {len(mappings)} company ID mappings from cache.")
                return mappings
        except Exception as e:
            print(f"[Scraper] Warning: Failed to load mappings file: {e}")
    return {}

def save_mappings(mappings):
    try:
        with open(MAPPINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(mappings, f, indent=2)
    except Exception as e:
        print(f"[Scraper] Error saving mappings: {e}")

def get_session_and_token():
    print("[Scraper] Establishing connection and retrieving session cookies...")
    url_base = "https://www.sharesansar.com/company/ADBL"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    context = ssl._create_unverified_context()
    cj = CookieJar()
    opener = urllib.request.build_opener(
        HTTPCookieProcessor(cj),
        urllib.request.HTTPSHandler(context=context)
    )
    
    req = urllib.request.Request(url_base, headers=headers)
    try:
        with opener.open(req, timeout=15) as response:
            html = response.read().decode('utf-8')
            match_token = re.search(r'name="_token"[^>]*content="([^"]+)"', html)
            if not match_token:
                match_token = re.search(r'content="([^"]+)"[^>]*name="_token"', html)
            if not match_token:
                match_token = re.search(r'csrf-token[^>]*content="([^"]+)"', html)
            
            csrf_token = match_token.group(1) if match_token else None
            if csrf_token:
                print(f"[Scraper] CSRF token successfully retrieved: {csrf_token[:8]}...")
                return opener, csrf_token
            else:
                print("[Scraper] Error: CSRF token not found in the HTML page.")
    except Exception as e:
        print(f"[Scraper] Error establishing session: {e}")
    return opener, None

def fetch_company_id(opener, symbol):
    url = f"https://www.sharesansar.com/company/{symbol}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with opener.open(req, timeout=15) as response:
            html = response.read().decode('utf-8')
            match_id = re.search(r'id="companyid"[^>]*>(\d+)</div>', html)
            if match_id:
                return match_id.group(1)
    except Exception as e:
        print(f"[Scraper] Error resolving company ID for {symbol}: {e}")
    return None

def fetch_price_history_paged(opener, csrf_token, symbol, company_id, max_records=250):
    """Fetches stock price history using paging with length=50 to stay within server constraints."""
    url = "https://www.sharesansar.com/company-price-history"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": csrf_token
    }
    
    all_records = []
    start = 0
    length = 50
    
    while len(all_records) < max_records:
        payload = {
            "draw": "1",
            "start": str(start),
            "length": str(length),
            "company": company_id,
            "search[value]": ""
        }
        data = urllib.parse.urlencode(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with opener.open(req, timeout=10) as response:
                res_json = json.loads(response.read().decode('utf-8'))
                raw_data = res_json.get("data", [])
                if not raw_data:
                    break
                
                page_records = []
                for item in raw_data:
                    try:
                        page_records.append({
                            "date": item["published_date"],
                            "open": float(item["open"].replace(",", "")),
                            "high": float(item["high"].replace(",", "")),
                            "low": float(item["low"].replace(",", "")),
                            "close": float(item["close"].replace(",", "")),
                            "volume": int(float(item["traded_quantity"].replace(",", "")))
                        })
                    except Exception:
                        continue
                
                all_records.extend(page_records)
                
                # If we got fewer records than requested, we reached the end of history
                if len(raw_data) < length:
                    break
                    
                start += length
                time.sleep(0.5)  # Polite delay between page requests
        except Exception as e:
            print(f"   [Scraper] Error fetching history page start={start} for {symbol}: {e}")
            break
            
    # Sort chronological: oldest to newest
    all_records.reverse()
    return all_records

def main():
    import argparse
    parser = argparse.ArgumentParser(description="NEPSE Historical Data Scraper")
    parser.add_argument("--limit", type=int, default=None, help="Limit the number of symbols to scrape (for testing)")
    parser.add_argument("--records", type=int, default=250, help="Max historical records to scrape per company (default: 250 = 1 Year)")
    args = parser.parse_args()

    os.makedirs(CACHE_DIR, exist_ok=True)
    
    symbols = load_symbols()
    if args.limit:
        symbols = symbols[:args.limit]
        print(f"[Scraper] Testing enabled: limiting scrape run to first {args.limit} symbols.")

    mappings = load_mappings()
    opener, csrf_token = get_session_and_token()
    
    if not csrf_token:
        print("[Scraper] Fatal: Could not establish a session with CSRF token. Exiting.")
        sys.exit(1)

    success_count = 0
    fail_count = 0
    
    print("\n" + "=" * 60)
    print("                 STARTING HISTORICAL DATA SCRAPE               ")
    print(f"   Max Records per Script: {args.records}")
    print("=" * 60 + "\n")
    
    for idx, symbol in enumerate(symbols):
        print(f"[{idx+1}/{len(symbols)}] Processing symbol: {symbol}...")
        
        # 1. Resolve Company ID
        company_id = mappings.get(symbol)
        if not company_id:
            print(f"   -> Mapping not found in cache. Fetching from ShareSansar...")
            company_id = fetch_company_id(opener, symbol)
            if company_id:
                mappings[symbol] = company_id
                save_mappings(mappings)
                print(f"   -> Resolved {symbol} to company ID: {company_id}")
                time.sleep(1.0)  # Rate limiting safety delay
            else:
                print(f"   -> Error: Could not resolve company ID for {symbol}. Skipping.")
                fail_count += 1
                continue
        else:
            print(f"   -> Cached company ID found: {company_id}")

        # 2. Check cache status
        cache_file = os.path.join(CACHE_DIR, f"{symbol.lower()}.json")
        is_fresh = False
        if os.path.exists(cache_file):
            mtime = os.path.getmtime(cache_file)
            mdate = datetime.fromtimestamp(mtime).date()
            if mdate == datetime.now().date():
                try:
                    with open(cache_file, "r", encoding="utf-8") as f:
                        cached_data = json.load(f)
                        if len(cached_data) >= min(args.records, 100):
                            is_fresh = True
                except Exception:
                    pass

        if is_fresh:
            print(f"   -> Cache is already fresh for today ({len(cached_data)} items). Skipping download.")
            success_count += 1
            continue

        # 3. Download History using Paging
        print(f"   -> Downloading price history (paging start=0)...")
        history = fetch_price_history_paged(opener, csrf_token, symbol, company_id, max_records=args.records)
        
        if history:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=2)
            print(f"   -> Successfully saved {len(history)} trading records to cache.")
            success_count += 1
        else:
            print(f"   -> Error: Failed to fetch history for {symbol}.")
            fail_count += 1

        # Rate limiting delay
        time.sleep(1.0)

    print("\n" + "=" * 60)
    print("                 HISTORICAL SCRAPE COMPLETED                  ")
    print(f"   Successful: {success_count}")
    print(f"   Failed:     {fail_count}")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
