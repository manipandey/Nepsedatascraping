#!/usr/bin/env python3
import os
import csv
import json
import ssl
import urllib.request
import re
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
    
    # Save as JSON
    json_path = os.path.join("data", "nepse_today.json")
    from datetime import timezone
    payload = {
        "date": trade_date,
        "scraped_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "summary": summary,
        "stocks": stocks
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

if __name__ == "__main__":
    scrape_nepse()
