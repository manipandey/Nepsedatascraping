#!/usr/bin/env python3
import os
import csv
import json
import ssl
import urllib.request
import urllib.parse
import re
import time
from datetime import datetime
from html.parser import HTMLParser

class ShareSansarParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_thead = False
        self.in_tbody = False
        self.in_tr = False
        self.in_cell = False
        self.current_row = []
        self.headers = []
        self.rows = []
        self.cell_data = ""

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        # Identify the main price table
        if tag == "table" and (attrs_dict.get("id") == "headFixed" or "dataTable" in attrs_dict.get("class", "")):
            self.in_table = True
        elif self.in_table:
            if tag == "thead":
                self.in_thead = True
            elif tag == "tbody":
                self.in_tbody = True
            elif tag == "tr":
                self.in_tr = True
                self.current_row = []
            elif tag in ["th", "td"]:
                self.in_cell = True
                self.cell_data = ""

    def handle_endtag(self, tag):
        if tag == "table":
            self.in_table = False
        elif self.in_table:
            if tag == "thead":
                self.in_thead = False
            elif tag == "tbody":
                self.in_tbody = False
            elif tag == "tr":
                self.in_tr = False
                if self.in_thead:
                    # Clean up header names
                    self.headers = [h.strip() for h in self.current_row]
                elif self.in_tbody:
                    self.rows.append(self.current_row)
            elif tag in ["th", "td"]:
                self.in_cell = False
                self.current_row.append(self.cell_data.strip())

    def handle_data(self, data):
        if self.in_table and self.in_cell:
            self.cell_data += data

def clean_float(val):
    if not val or val.strip() in ["-", "", "None"]:
        return 0.0
    try:
        return float(val.replace(",", "").strip())
    except ValueError:
        return 0.0

def clean_int(val):
    if not val or val.strip() in ["-", "", "None"]:
        return 0
    try:
        return int(val.replace(",", "").strip())
    except ValueError:
        try:
            return int(float(val.replace(",", "").strip()))
        except ValueError:
            return 0

def scrape_nepse():
    url = "https://www.sharesansar.com/today-share-price"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Connecting to ShareSansar...")
    context = ssl._create_unverified_context()
    req = urllib.request.Request(url, headers=headers)
    
    try:
        with urllib.request.urlopen(req, context=context, timeout=15) as response:
            html = response.read().decode('utf-8')
    except Exception as e:
        print(f"Error fetching page: {e}")
        return False
        
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Page fetched successfully ({len(html)} bytes). Parsing data...")
    
    # Extract the trade date from the datepicker input
    # e.g., <input ... id="fromdate" value="2026-07-31" ... />
    date_match = re.search(r'id="fromdate"\s+value="([^"]+)"', html)
    if not date_match:
        # Try alternate pattern
        date_match = re.search(r'name="date"[^>]+value="([^"]+)"', html)
        
    trade_date = date_match.group(1) if date_match else datetime.now().strftime("%Y-%m-%d")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Detected stock trading date: {trade_date}")
    
    # Parse table contents
    parser = ShareSansarParser()
    parser.feed(html)
    
    if not parser.headers or not parser.rows:
        print("Error: Could not locate today's share price table in the HTML content.")
        return False
        
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Found table with {len(parser.headers)} columns and {len(parser.rows)} rows.")
    
    # Create header mapping to avoid column shift issues
    header_map = {}
    for idx, name in enumerate(parser.headers):
        normalized = name.lower().replace(" ", "").replace("-", "").replace("%", "")
        header_map[normalized] = idx
        
    # Map headers to standard field names
    fields = {
        "symbol": ["symbol"],
        "open": ["open"],
        "high": ["high"],
        "low": ["low"],
        "close": ["close", "ltp"],  # fallback to ltp if close isn't present
        "ltp": ["ltp", "close"],
        "volume": ["vol", "volume"],
        "prev_close": ["prev.close", "previousclose"],
        "turnover": ["turnover"],
        "transactions": ["trans.", "transactions", "trans"],
        "diff": ["diff", "change"],
        "diff_percent": ["diff", "change", "diffpercent", "changepercent"],
        "fifty_two_week_high": ["52weekshigh", "52wkhigh"],
        "fifty_two_week_low": ["52weekslow", "52wklow"],
        "confidence": ["conf.", "confidence"]
    }
    
    # Helper to retrieve index by field key
    def get_col_idx(field_key):
        for name in fields[field_key]:
            if name in header_map:
                return header_map[name]
        return -1
        
    symbol_idx = get_col_idx("symbol")
    open_idx = get_col_idx("open")
    high_idx = get_col_idx("high")
    low_idx = get_col_idx("low")
    close_idx = get_col_idx("close")
    ltp_idx = get_col_idx("ltp")
    volume_idx = get_col_idx("volume")
    prev_close_idx = get_col_idx("prev_close")
    turnover_idx = get_col_idx("turnover")
    trans_idx = get_col_idx("transactions")
    diff_idx = get_col_idx("diff")
    
    # Note: ShareSansar has "Diff" and "Diff %"
    # Let's find "diff" and "diff%" explicitly
    diff_pct_idx = header_map.get("diff", -1)
    # Check if there is an explicit percentage column
    for h in header_map:
        if "diff" in h and ("%" in h or "pct" in h or h.endswith("percent")):
            diff_pct_idx = header_map[h]
            break
    if diff_pct_idx == -1 or diff_pct_idx == diff_idx:
        # Fallback to general diff percent matching
        diff_pct_idx = get_col_idx("diff_percent")
        
    high_52_idx = get_col_idx("fifty_two_week_high")
    low_52_idx = get_col_idx("fifty_two_week_low")
    conf_idx = get_col_idx("confidence")
    
    # Process rows
    stocks = []
    total_turnover = 0.0
    total_volume = 0
    total_transactions = 0
    advancers = 0
    decliners = 0
    unchanged = 0
    
    for row in parser.rows:
        if len(row) <= max(symbol_idx, open_idx, high_idx, low_idx, close_idx, ltp_idx):
            continue
            
        symbol = row[symbol_idx].strip()
        if not symbol:
            continue
            
        open_price = clean_float(row[open_idx])
        high_price = clean_float(row[high_idx])
        low_price = clean_float(row[low_idx])
        close_price = clean_float(row[close_idx])
        ltp = clean_float(row[ltp_idx])
        
        # If closing price is 0, fallback to LTP
        if close_price == 0.0 and ltp > 0.0:
            close_price = ltp
        elif ltp == 0.0 and close_price > 0.0:
            ltp = close_price
            
        volume = clean_int(row[volume_idx]) if volume_idx != -1 else 0
        prev_close = clean_float(row[prev_close_idx]) if prev_close_idx != -1 else 0.0
        turnover = clean_float(row[turnover_idx]) if turnover_idx != -1 else 0.0
        transactions = clean_int(row[trans_idx]) if trans_idx != -1 else 0
        
        # Calculate diff if not explicitly parsed
        diff = clean_float(row[diff_idx]) if diff_idx != -1 else (close_price - prev_close if prev_close > 0 else 0.0)
        
        # Percentage difference
        if diff_pct_idx != -1 and diff_pct_idx < len(row):
            diff_percent = clean_float(row[diff_pct_idx])
        else:
            diff_percent = (diff / prev_close * 100) if prev_close > 0 else 0.0
            
        fifty_two_high = clean_float(row[high_52_idx]) if high_52_idx != -1 else 0.0
        fifty_two_low = clean_float(row[low_52_idx]) if low_52_idx != -1 else 0.0
        confidence = clean_float(row[conf_idx]) if conf_idx != -1 else 0.0
        
        # Track statistics
        total_turnover += turnover
        total_volume += volume
        total_transactions += transactions
        
        if diff > 0:
            advancers += 1
        elif diff < 0:
            decliners += 1
        else:
            unchanged += 1
            
        stocks.append({
            "symbol": symbol,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price,
            "ltp": ltp,
            "prev_close": prev_close,
            "diff": diff,
            "diff_percent": diff_percent,
            "volume": volume,
            "turnover": turnover,
            "transactions": transactions,
            "fifty_two_week_high": fifty_two_high,
            "fifty_two_week_low": fifty_two_low,
            "confidence": confidence
        })
        
    # Attempt to fetch and merge live trading prices from https://www.sharesansar.com/live-trading
    sub_indices = []
    # Try to load existing indices as fallback
    try:
        json_path = os.path.join("data", "nepse_today.json")
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                old_data = json.load(f)
                sub_indices = old_data.get("indices", [])
    except Exception:
        pass

    try:
        import time
        # Bypass server-side caches with timestamp param
        url_live = f"https://www.sharesansar.com/live-trading?t={int(time.time())}"
        headers_live = headers.copy()
        headers_live["Cache-Control"] = "no-cache"
        headers_live["Pragma"] = "no-cache"
        
        req_live = urllib.request.Request(url_live, headers=headers_live)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Connecting to ShareSansar Live Trading...")
        
        with urllib.request.urlopen(req_live, context=context, timeout=15) as response_live:
            html_live = response_live.read().decode('utf-8')
            
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Live Trading page fetched successfully ({len(html_live)} bytes).")
        
        # Parse sub-indices from live trading HTML
        blocks = re.findall(r'<div class="mu-list">(.*?)</div>', html_live, re.DOTALL)
        if blocks:
            parsed_indices = []
            for b in blocks:
                title_match = re.search(r'<h4>(.*?)</h4>', b)
                price_match = re.search(r'<p class="mu-price">(.*?)</p>', b)
                value_match = re.search(r'class="mu-value[^"]*"[^>]*>\s*([^\s<]+)', b)
                percent_match = re.search(r'class="mu-percent[^"]*"[^>]*>\s*([^\s<]+)', b)
                if title_match:
                    title = title_match.group(1).strip()
                    
                    raw_price = price_match.group(1).strip() if price_match else "0"
                    try:
                        turnover = float(raw_price.replace(",", ""))
                    except ValueError:
                        turnover = 0.0
                        
                    raw_val = value_match.group(1).strip() if value_match else "0"
                    try:
                        value = float(raw_val.replace(",", ""))
                    except ValueError:
                        value = 0.0
                        
                    raw_pct = percent_match.group(1).strip() if percent_match else "0%"
                    clean_pct = raw_pct.replace("%", "").strip()
                    try:
                        percent_change = float(clean_pct.replace(",", ""))
                    except ValueError:
                        percent_change = 0.0
                        
                    is_red = "text-red" in b or "-" in clean_pct
                    if is_red and percent_change > 0:
                        percent_change = -percent_change
                        
                    change = round(value * (percent_change / 100), 2) if value > 0 else 0.0
                    
                    parsed_indices.append({
                        "title": title,
                        "value": value,
                        "change": change,
                        "change_percent": percent_change,
                        "turnover": turnover
                    })
            if parsed_indices:
                sub_indices = parsed_indices
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraped {len(sub_indices)} market indices/sub-indices.")
        
        # Parse live date and time
        # <span id="dDate" class="text-org">2026-08-03 13:32:00</span>
        live_date_match = re.search(r'id="dDate"[^>]*>([^<]+)</span>', html_live)
        if live_date_match:
            live_datetime_str = live_date_match.group(1).strip()
            live_date = live_datetime_str.split()[0]
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Live Trading Date: {live_date} ({live_datetime_str})")
            trade_date = live_date
            
        parser_live = ShareSansarParser()
        parser_live.feed(html_live)
        
        if parser_live.headers and parser_live.rows:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Found live table with {len(parser_live.headers)} columns and {len(parser_live.rows)} rows.")
            
            header_map_live = {}
            for idx, name in enumerate(parser_live.headers):
                normalized = name.lower().replace(" ", "").replace("-", "").replace("%", "").replace(".", "")
                header_map_live[normalized] = idx
                
            def get_col_idx_live(field_key):
                for name in fields[field_key]:
                    name_clean = name.replace(".", "")
                    if name_clean in header_map_live:
                        return header_map_live[name_clean]
                return -1
                
            symbol_idx_l = get_col_idx_live("symbol")
            open_idx_l = get_col_idx_live("open")
            high_idx_l = get_col_idx_live("high")
            low_idx_l = get_col_idx_live("low")
            ltp_idx_l = get_col_idx_live("ltp")
            volume_idx_l = get_col_idx_live("volume")
            prev_close_idx_l = get_col_idx_live("prev_close")
            diff_idx_l = get_col_idx_live("diff")
            
            diff_pct_idx_l = header_map_live.get("diff", -1)
            for h in header_map_live:
                if "diff" in h and ("%" in h or "pct" in h or h.endswith("percent") or h == "change"):
                    diff_pct_idx_l = header_map_live[h]
                    break
            if diff_pct_idx_l == -1 or diff_pct_idx_l == diff_idx_l:
                diff_pct_idx_l = get_col_idx_live("diff_percent")
                
            live_updates = {}
            for row in parser_live.rows:
                if len(row) <= max(symbol_idx_l, open_idx_l, ltp_idx_l):
                    continue
                sym = row[symbol_idx_l].strip()
                if not sym:
                    continue
                    
                open_val = clean_float(row[open_idx_l])
                high_val = clean_float(row[high_idx_l])
                low_val = clean_float(row[low_idx_l])
                ltp_val = clean_float(row[ltp_idx_l])
                volume_val = clean_int(row[volume_idx_l]) if volume_idx_l != -1 else 0
                prev_close_val = clean_float(row[prev_close_idx_l]) if prev_close_idx_l != -1 else 0.0
                
                diff_val = clean_float(row[diff_idx_l]) if diff_idx_l != -1 else (ltp_val - prev_close_val if prev_close_val > 0 else 0.0)
                diff_pct_val = clean_float(row[diff_pct_idx_l]) if diff_pct_idx_l != -1 else (diff_val / prev_close_val * 100 if prev_close_val > 0 else 0.0)
                
                live_updates[sym] = {
                    "open": open_val,
                    "high": high_val,
                    "low": low_val,
                    "close": ltp_val,
                    "ltp": ltp_val,
                    "volume": volume_val,
                    "prev_close": prev_close_val,
                    "diff": diff_val,
                    "diff_percent": diff_pct_val
                }
                
            is_stale = (trade_date != live_date)
            merged_stocks = {}
            for s in stocks:
                sym = s["symbol"]
                
                if is_stale:
                    s["volume"] = 0
                    s["turnover"] = 0.0
                    s["transactions"] = 0
                    s["diff"] = 0.0
                    s["diff_percent"] = 0.0
                    s["open"] = s["close"]
                    s["high"] = s["close"]
                    s["low"] = s["close"]
                    s["prev_close"] = s["close"]
                    
                if sym in live_updates:
                    live = live_updates[sym]
                    s["open"] = live["open"]
                    s["high"] = live["high"]
                    s["low"] = live["low"]
                    s["close"] = live["close"]
                    s["ltp"] = live["ltp"]
                    
                    if is_stale:
                        vwap = (live["high"] + live["low"] + live["ltp"]) / 3
                        if vwap == 0: vwap = live["ltp"]
                        s["turnover"] = live["volume"] * vwap
                    elif live["volume"] > s["volume"]:
                        added_vol = live["volume"] - s["volume"]
                        s["turnover"] += added_vol * live["ltp"]
                        
                    s["volume"] = live["volume"]
                    s["prev_close"] = live["prev_close"]
                    s["diff"] = live["diff"]
                    s["diff_percent"] = live["diff_percent"]
                    del live_updates[sym]
                merged_stocks[sym] = s
                
            for sym, live in live_updates.items():
                vwap = (live["high"] + live["low"] + live["ltp"]) / 3
                if vwap == 0: vwap = live["ltp"]
                
                merged_stocks[sym] = {
                    "symbol": sym,
                    "open": live["open"],
                    "high": live["high"],
                    "low": live["low"],
                    "close": live["close"],
                    "ltp": live["ltp"],
                    "prev_close": live["prev_close"],
                    "diff": live["diff"],
                    "diff_percent": live["diff_percent"],
                    "volume": live["volume"],
                    "turnover": live["volume"] * vwap,
                    "transactions": 0,
                    "fifty_two_week_high": live["high"],
                    "fifty_two_week_low": live["low"],
                    "confidence": 50.0
                }
                
            stocks = list(merged_stocks.values())
            
            # Recalculate summary stats with live values
            total_turnover = 0.0
            total_volume = 0
            total_transactions = 0
            advancers = 0
            decliners = 0
            unchanged = 0
            
            for s in stocks:
                total_turnover += s["turnover"]
                total_volume += s["volume"]
                total_transactions += s["transactions"]
                if s["diff"] > 0:
                    advancers += 1
                elif s["diff"] < 0:
                    decliners += 1
                else:
                    unchanged += 1
                    
            # Fetch live market summary for accurate totals
            try:
                url_summary = f"https://www.sharesansar.com/market-summary?t={int(time.time())}"
                req_summary = urllib.request.Request(url_summary, headers=headers_live)
                with urllib.request.urlopen(req_summary, context=context, timeout=15) as response_summary:
                    html_summary = response_summary.read().decode('utf-8')
                
                turnover_match = re.search(r'Total Turnovers.*?<td[^>]*>([\d,\.]+)</td>', html_summary, re.IGNORECASE | re.DOTALL)
                volume_match = re.search(r'Total Traded Shares.*?<td[^>]*>([\d,\.]+)</td>', html_summary, re.IGNORECASE | re.DOTALL)
                trans_match = re.search(r'Total Transaction.*?<td[^>]*>([\d,\.]+)</td>', html_summary, re.IGNORECASE | re.DOTALL)
                
                if turnover_match:
                    total_turnover = float(turnover_match.group(1).replace(',', ''))
                if volume_match:
                    total_volume = int(volume_match.group(1).replace(',', ''))
                if trans_match:
                    total_transactions = int(trans_match.group(1).replace(',', ''))
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Live Market Summary data fetched successfully!")
            except Exception as e:
                print(f"Error fetching live market summary: {e}")

            summary = {
                "total_turnover": round(total_turnover, 2),
                "total_volume": total_volume,
                "total_transactions": total_transactions,
                "advancers": advancers,
                "decliners": decliners,
                "unchanged": unchanged,
                "total_instruments": len(stocks)
            }
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Live Trading data merged successfully! ({len(stocks)} total stocks)")
            
    except Exception as ex:
        print(f"Error fetching/merging Live Trading data: {ex}")

    # Sort stocks alphabetically by default
    stocks.sort(key=lambda s: s["symbol"])
    
    # Prepare summary data
    summary = {
        "total_turnover": round(total_turnover, 2),
        "total_volume": total_volume,
        "total_transactions": total_transactions,
        "advancers": advancers,
        "decliners": decliners,
        "unchanged": unchanged,
        "total_instruments": len(stocks)
    }
    
    # Save folder path
    os.makedirs("data", exist_ok=True)
    
    for s in stocks:
        sym = s.get("symbol", "").upper().strip()
        ltp = float(s.get("ltp", 0) or s.get("close", 0) or 0)
        cache_path = os.path.join("data", "history_cache", f"{sym.lower()}.json")
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as hf:
                    hist = json.load(hf)
                if hist:
                    closes = [float(r["close"]) for r in hist[-19:] if "close" in r and r.get("close") is not None]
                    if ltp > 0:
                        closes.append(ltp)
                    elif hist[-1].get("close"):
                        closes.append(float(hist[-1]["close"]))
                    if len(closes) >= 3:
                        dma20 = round(sum(closes) / len(closes), 2)
                        s["dma20"] = dma20
                        s["diff_20dma"] = round(((ltp - dma20) / dma20) * 100, 2) if dma20 > 0 else 0.0
                        s["below_20dma"] = ltp < dma20
            except Exception:
                pass

    # Save as JSON
    json_path = os.path.join("data", "nepse_today.json")
    from datetime import timezone
    payload = {
        "date": trade_date,
        "scraped_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "summary": summary,
        "stocks": stocks,
        "indices": sub_indices
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Saved JSON data to {json_path}")
    
    # Save as CSV
    csv_path = os.path.join("data", "nepse_today.csv")
    csv_headers = [
        "Symbol", "Open", "High", "Low", "Close", "LTP", "Prev_Close", 
        "Diff", "Diff_Percent", "Volume", "Turnover", "Transactions", 
        "Fifty_Two_Week_High", "Fifty_Two_Week_Low", "Confidence"
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(csv_headers)
        for s in stocks:
            writer.writerow([
                s["symbol"], s["open"], s["high"], s["low"], s["close"], s["ltp"], s["prev_close"],
                s["diff"], s["diff_percent"], s["volume"], s["turnover"], s["transactions"],
                s["fifty_two_week_high"], s["fifty_two_week_low"], s["confidence"]
            ])
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Saved CSV data to {csv_path}")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraping cycle completed successfully!")
    return True

def clean_html(text):
    if not isinstance(text, str):
        return text
    return re.sub(r'<[^>]+>', '', text).strip()

def scrape_sharesansar_floorsheet(symbol="", buyer="", seller="", length=500):
    url = "https://www.sharesansar.com/floorsheet"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01"
    }
    
    query_params = {
        "draw": "1",
        "start": "0",
        "length": str(length),
        "company": symbol.upper() if symbol else "",
        "buyer": buyer if buyer else "",
        "seller": seller if seller else "",
        "date": "",
        "_": str(int(time.time() * 1000))
    }
    
    qs = urllib.parse.urlencode(query_params)
    full_url = f"{url}?{qs}"
    
    context = ssl._create_unverified_context()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(), urllib.request.HTTPSHandler(context=context))
    
    try:
        req = urllib.request.Request(full_url, headers=headers)
        with opener.open(req, timeout=15) as res:
            data = json.loads(res.read().decode('utf-8'))
            
            raw_records = data.get("data", [])
            formatted = []
            
            for index, r in enumerate(raw_records):
                formatted.append({
                    "sn": str(index + 1),
                    "symbol": clean_html(r.get("symbol", "")),
                    "buyer": r.get("buyer", ""),
                    "seller": r.get("seller", ""),
                    "quantity": float(str(r.get("quantity", "0")).replace(',', '')),
                    "rate": float(str(r.get("rate", "0")).replace(',', '')),
                    "amount": float(str(r.get("amount", "0")).replace(',', ''))
                })
                
            return formatted
    except Exception as e:
        print(f"Error fetching floorsheet for {symbol}: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    scrape_nepse()
