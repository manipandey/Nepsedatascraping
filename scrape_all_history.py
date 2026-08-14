#!/usr/bin/env python3
import os
import sys
import time
import json
import re
import ssl
import urllib.request
import urllib.parse
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor, HTTPSHandler

def main():
    # Parse arguments
    force = "--force" in sys.argv
    limit = None
    if "--limit" in sys.argv:
        try:
            limit_idx = sys.argv.index("--limit")
            limit = int(sys.argv[limit_idx + 1])
        except (ValueError, IndexError):
            print("Error: --limit requires an integer value.")
            sys.exit(1)

    # 1. Load active symbols from data/nepse_today.json
    json_path = os.path.join("data", "nepse_today.json")
    if not os.path.exists(json_path):
        print("Error: data/nepse_today.json not found. Please run scrape.py first.")
        sys.exit(1)

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            today_data = json.load(f)
        active_symbols = [s["symbol"].strip().upper() for s in today_data.get("stocks", [])]
    except Exception as e:
        print(f"Error reading active stocks: {e}")
        sys.exit(1)

    if not active_symbols:
        print("Error: No active stock symbols found in data/nepse_today.json.")
        sys.exit(1)

    print(f"Loaded {len(active_symbols)} active symbols to scrape.")

    # Create history cache directory
    cache_dir = os.path.join("data", "history_cache")
    os.makedirs(cache_dir, exist_ok=True)

    # 2. GET today-share-price page to establish cookies, get CSRF token, and cmpjson
    print("Connecting to ShareSansar to establish session...")
    context = ssl._create_unverified_context()
    cj = CookieJar()
    opener = urllib.request.build_opener(
        HTTPCookieProcessor(cj),
        HTTPSHandler(context=context)
    )

    url_base = "https://www.sharesansar.com/today-share-price"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        req = urllib.request.Request(url_base, headers=headers)
        with opener.open(req, timeout=15) as response:
            html = response.read().decode("utf-8")
    except Exception as e:
        print(f"Error connecting to ShareSansar: {e}")
        sys.exit(1)

    # Extract CSRF token
    token_match = re.search(r'name="_token"[^>]*content="([^"]+)"', html)
    if not token_match:
        token_match = re.search(r'content="([^"]+)"[^>]*name="_token"', html)
    if not token_match:
        token_match = re.search(r'csrf-token[^>]*content="([^"]+)"', html)
    
    if not token_match:
        print("Error: Could not extract CSRF token from page.")
        sys.exit(1)
    csrf_token = token_match.group(1).strip()
    print("Established session successfully. CSRF Token loaded.")

    # Extract cmpjson
    cmp_match = re.search(r"cmpjson\s*=\s*(\[.*?\])", html)
    if not cmp_match:
        print("Error: Could not extract company symbol-to-ID list (cmpjson) from page.")
        sys.exit(1)

    try:
        cmp_data = json.loads(cmp_match.group(1))
        cmp_map = {item["symbol"].strip().upper(): item["id"] for item in cmp_data}
        print(f"Loaded internal database mapping for {len(cmp_map)} companies.")
    except Exception as e:
        print(f"Error parsing cmpjson: {e}")
        sys.exit(1)

    # 3. Filter symbols to scrape
    symbols_to_scrape = []
    for sym in active_symbols:
        cache_file = os.path.join(cache_dir, f"{sym.lower()}.json")
        if os.path.exists(cache_file) and not force:
            try:
                with open(cache_file, "r") as f:
                    cached_records = json.load(f)
                if isinstance(cached_records, list) and len(cached_records) > 0:
                    # Skip if already cached
                    continue
            except Exception:
                pass
        
        if sym in cmp_map:
            symbols_to_scrape.append((sym, cmp_map[sym]))
        else:
            print(f"Warning: Symbol {sym} not found in ShareSansar cmpjson. Skipping.")

    # Apply limit
    if limit is not None:
        symbols_to_scrape = symbols_to_scrape[:limit]

    print(f"Starting crawl for {len(symbols_to_scrape)} symbols (out of {len(active_symbols)} active symbols).")
    
    # 4. Crawling Loop
    url_post = "https://www.sharesansar.com/company-price-history"
    post_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "X-CSRF-Token": csrf_token,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": url_base,
        "X-Requested-With": "XMLHttpRequest"
    }

    scraped_count = 0
    for idx, (sym, cid) in enumerate(symbols_to_scrape, 1):
        print(f"\n[{idx}/{len(symbols_to_scrape)}] Scraping {sym} (ID: {cid})...")
        cache_file = os.path.join(cache_dir, f"{sym.lower()}.json")
        
        all_records = []
        start = 0
        length = 50
        draw = 1
        
        while True:
            payload = {
                "draw": str(draw),
                "start": str(start),
                "length": str(length),
                "company": str(cid),
                "search[value]": ""
            }
            data_encoded = urllib.parse.urlencode(payload).encode("utf-8")
            req_post = urllib.request.Request(url_post, data=data_encoded, headers=post_headers)
            
            try:
                response = opener.open(req_post, timeout=15)
                res_json = json.loads(response.read().decode("utf-8"))
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
                print(f"  Page {draw}: fetched {len(page_records)} rows (Total so far: {len(all_records)})")
                
                if len(raw_data) < length:
                    break
                    
                start += length
                draw += 1
                time.sleep(0.4) # Polite rate limit
                
            except Exception as e:
                print(f"  Error on page {draw}: {e}. Retrying session...")
                # Re-fetch session token on error
                try:
                    req_ref = urllib.request.Request(url_base, headers=headers)
                    with opener.open(req_ref, timeout=15) as res_ref:
                        html_ref = res_ref.read().decode("utf-8")
                    t_match = re.search(r'name="_token"[^>]*content="([^"]+)"', html_ref)
                    if t_match:
                        csrf_token = t_match.group(1).strip()
                        post_headers["X-CSRF-Token"] = csrf_token
                    time.sleep(1.0)
                except Exception as ex_ref:
                    print(f"  Session refresh failed: {ex_ref}")
                break
        
        if all_records:
            # Sort chronologically (ascending date)
            all_records.reverse()
            try:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(all_records, f, indent=2)
                print(f"  Saved {len(all_records)} records to {cache_file}")
                scraped_count += 1
            except Exception as e:
                print(f"  Error saving cache file: {e}")
        else:
            print(f"  Warning: No records found for {sym}")
            
        time.sleep(0.5) # Polite rate limit between companies

    print(f"\nHistorical crawl complete. Scraped and saved {scraped_count} files.")

if __name__ == "__main__":
    main()
