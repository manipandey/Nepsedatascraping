#!/usr/bin/env python3
import os
import sys
import time
import webbrowser
import http.server
import socketserver
import threading
import scrape
from scrape import scrape_nepse
from scrape_systemx import SystemXLiteScraper

PORT = 8085
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

import json
import urllib.request
import urllib.parse
import ssl
import re
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor

def get_stock_history_from_source(symbol):
    symbol = symbol.upper().strip()
    cache_dir = os.path.join(DIRECTORY, "data", "history_cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f"{symbol.lower()}.json")
    
    # Helper function to append today's live stock data dynamically
    def append_today_live_data(history):
        try:
            today_file = os.path.join(DIRECTORY, "data", "nepse_today.json")
            if os.path.exists(today_file) and history:
                with open(today_file, "r", encoding="utf-8") as f:
                    today_data = json.load(f)
                
                today_date = today_data.get("date")
                if today_date:
                    # Check if today_date is already in history
                    last_record_date = history[-1].get("date")
                    if last_record_date and last_record_date < today_date:
                        for s in today_data.get("stocks", []):
                            if s["symbol"].upper().strip() == symbol:
                                history.append({
                                    "date": today_date,
                                    "open": float(s["open"]),
                                    "high": float(s["high"]),
                                    "low": float(s["low"]),
                                    "close": float(s["close"]),
                                    "volume": int(s["volume"])
                                })
                                print(f"[Server] Dynamically appended today live price ({today_date}) for {symbol}")
                                break
        except Exception as e:
            print(f"[Server] Error appending today live price: {e}")
        return history

def compute_all_stock_indicators(symbol, current_ltp, current_vol=None):
    symbol = symbol.upper().strip()
    cache_file = os.path.join(DIRECTORY, "data", "history_cache", f"{symbol.lower()}.json")
    if not os.path.exists(cache_file):
        return {}
    
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            history = json.load(f)
        if not history:
            return {}
        
        sorted_hist = sorted(history, key=lambda x: x.get("date", ""))
        closes = [float(x["close"]) for x in sorted_hist if x.get("close") is not None]
        volumes = [float(x["volume"]) for x in sorted_hist if x.get("volume") is not None]

        if current_ltp and float(current_ltp) > 0:
            closes.append(float(current_ltp))
        if current_vol and float(current_vol) > 0:
            volumes.append(float(current_vol))

        if len(closes) < 14:
            return {}

        # SMA 20 & SMA 50
        sma20 = sum(closes[-20:]) / min(len(closes), 20)
        sma50 = sum(closes[-50:]) / min(len(closes), 50)

        # 14-period RSI
        gains = []
        losses = []
        for i in range(len(closes) - 14, len(closes)):
            diff = closes[i] - closes[i - 1]
            if diff >= 0:
                gains.append(diff)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(diff))

        avg_gain = sum(gains) / 14.0
        avg_loss = sum(losses) / 14.0
        if avg_loss == 0:
            rsi14 = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi14 = 100.0 - (100.0 / (1.0 + rs))

        # 52-Week High / Low
        year_closes = closes[-250:] if len(closes) >= 250 else closes
        h52 = max(year_closes)
        l52 = min(year_closes)

        # Volume Surge Ratio
        avg_vol20 = sum(volumes[-21:-1]) / 20.0 if len(volumes) >= 21 else (sum(volumes) / len(volumes) if volumes else 1.0)
        curr_vol = volumes[-1] if volumes else 0
        volume_surge = (curr_vol / avg_vol20) if avg_vol20 > 0 else 1.0

        ltp_val = float(current_ltp) if current_ltp else closes[-1]
        diff_20sma = ((ltp_val - sma20) / sma20) * 100
        diff_50sma = ((ltp_val - sma50) / sma50) * 100

        is_golden_cross = sma20 >= sma50
        is_rsi_oversold = rsi14 <= 45.0
        is_rsi_overbought = rsi14 >= 55.0
        is_52w_breakout = (ltp_val / h52) >= 0.90 if h52 > 0 else False
        is_volume_surge = volume_surge >= 1.2

        # Calculate EMAs: EMA 20, EMA 50, EMA 100
        def compute_ema_series(series, n):
            if len(series) < n: return None
            k = 2.0 / (n + 1)
            val = sum(series[:n]) / n
            for price in series[n:]:
                val = (price * k) + (val * (1.0 - k))
            return round(val, 2)

        ema20 = compute_ema_series(closes, 20)
        ema50 = compute_ema_series(closes, 50)
        ema100 = compute_ema_series(closes, 100)

        is_ema_aligned = bool(ema20 and ema50 and ema100 and (ema20 > ema50 > ema100))

        # Williams 5-bar Fractal Low calculation
        fractal_low_val = None
        is_fractal_sweep = False
        is_bullish_candle = False

        if len(sorted_hist) >= 10:
            for i in range(len(sorted_hist) - 3, 1, -1):
                low_i = sorted_hist[i].get("low")
                if low_i is not None and i - 2 >= 0 and i + 2 < len(sorted_hist):
                    l_m2 = sorted_hist[i-2].get("low")
                    l_m1 = sorted_hist[i-1].get("low")
                    l_p1 = sorted_hist[i+1].get("low")
                    l_p2 = sorted_hist[i+2].get("low")
                    if (l_m2 and l_m1 and l_p1 and l_p2 and
                        low_i < l_m2 and low_i < l_m1 and low_i < l_p1 and low_i < l_p2):
                        fractal_low_val = round(low_i, 2)
                        break
            
            latest_bar = sorted_hist[-1]
            prev_bar = sorted_hist[-2] if len(sorted_hist) >= 2 else latest_bar
            curr_low = latest_bar.get("low", ltp_val)
            prev_low = prev_bar.get("low", ltp_val)

            if fractal_low_val is not None:
                is_fractal_sweep = (curr_low <= fractal_low_val) or (prev_low <= fractal_low_val)
            
            c_close = latest_bar.get("close", ltp_val)
            c_open = latest_bar.get("open", ltp_val)
            is_bullish_candle = (c_close >= c_open)

        is_ema_fractal_match = bool(is_ema_aligned and is_fractal_sweep and is_bullish_candle)

        return {
            "sma20": round(sma20, 2),
            "dma20": round(sma20, 2),
            "sma50": round(sma50, 2),
            "ema20": ema20,
            "ema50": ema50,
            "ema100": ema100,
            "rsi14": round(rsi14, 2),
            "diff_20sma": round(diff_20sma, 2),
            "diff_20dma": round(diff_20sma, 2),
            "diff_50sma": round(diff_50sma, 2),
            "fifty_two_week_high": round(h52, 2),
            "fifty_two_week_low": round(l52, 2),
            "volume_surge": round(volume_surge, 2),
            "is_golden_cross": is_golden_cross,
            "is_rsi_oversold": is_rsi_oversold,
            "is_rsi_overbought": is_rsi_overbought,
            "is_52w_breakout": is_52w_breakout,
            "is_volume_surge": is_volume_surge,
            "is_ema_aligned": is_ema_aligned,
            "fractal_low": fractal_low_val,
            "is_fractal_sweep": is_fractal_sweep,
            "is_bullish_candle": is_bullish_candle,
            "is_ema_fractal_match": is_ema_fractal_match
        }
    except Exception:
        return {}

def compute_stock_20sma(symbol, current_ltp):
    return compute_stock_20dma(symbol, current_ltp)

def compute_stock_20dma(symbol, current_ltp):
    symbol = symbol.upper().strip()
    cache_file = os.path.join(DIRECTORY, "data", "history_cache", f"{symbol.lower()}.json")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                history = json.load(f)
            if history:
                closes = [float(r["close"]) for r in history[-19:] if "close" in r and r.get("close") is not None]
                if current_ltp and float(current_ltp) > 0:
                    closes.append(float(current_ltp))
                elif history[-1].get("close"):
                    closes.append(float(history[-1]["close"]))
                
                if len(closes) >= 3:
                    sma20 = sum(closes) / len(closes)
                    return round(sma20, 2)
        except Exception as e:
            pass
    return None


    # Check cache validity (24 hours to preserve bulk pre-cached files)
    if os.path.exists(cache_file):
        mtime = os.path.getmtime(cache_file)
        if time.time() - mtime < 86400:
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    print(f"[Server] Returning cached price history for {symbol}")
                    history = json.load(f)
                    return append_today_live_data(history)
            except Exception:
                pass
                
    # 2. Scrape from ShareSansar
    try:
        url_company = f"https://www.sharesansar.com/company/{symbol}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest"
        }
        context = ssl._create_unverified_context()
        cj = CookieJar()
        opener = urllib.request.build_opener(
            HTTPCookieProcessor(cj),
            urllib.request.HTTPSHandler(context=context)
        )
        
        req_company = urllib.request.Request(url_company, headers=headers)
        company_id = None
        csrf_token = None
        
        with opener.open(req_company, timeout=10) as response:
            html = response.read().decode('utf-8')
            match_id = re.search(r'id="companyid"[^>]*>(\d+)</div>', html)
            if match_id:
                company_id = match_id.group(1)
            match_token = re.search(r'name="_token"[^>]*content="([^"]+)"', html)
            if not match_token:
                match_token = re.search(r'content="([^"]+)"[^>]*name="_token"', html)
            if not match_token:
                match_token = re.search(r'csrf-token[^>]*content="([^"]+)"', html)
            if match_token:
                csrf_token = match_token.group(1)
                
        if not company_id or not csrf_token:
            print(f"[Server] Warning: Failed to extract company ID or CSRF token for {symbol}.")
            return []
            
        url_history = "https://www.sharesansar.com/company-price-history"
        headers_history = headers.copy()
        headers_history["X-CSRF-Token"] = csrf_token
        headers_history["X-Requested-With"] = "XMLHttpRequest"
        
        formatted_history = []
        start = 0
        length = 50
        max_records = 1000  # On cache-miss fetch up to 1000 records (covers ~4 Years, fast & polite)
        
        while len(formatted_history) < max_records:
            payload = {
                "draw": "1",
                "start": str(start),
                "length": str(length),
                "company": company_id,
                "search[value]": ""
            }
            data = urllib.parse.urlencode(payload).encode('utf-8')
            req_history = urllib.request.Request(url_history, data=data, headers=headers_history, method="POST")
            
            try:
                with opener.open(req_history, timeout=10) as response:
                    result = response.read().decode('utf-8')
                    res_json = json.loads(result)
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
                            
                    formatted_history.extend(page_records)
                    
                    if len(raw_data) < length:
                        break
                        
                    start += length
                    time.sleep(0.4)  # Small safety delay between pages
            except Exception as ex_page:
                print(f"[Server] Error fetching history page start={start} for {symbol}: {ex_page}")
                break
                
        formatted_history.reverse()
        
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(formatted_history, f, indent=2)
            
        print(f"[Server] Scraped and cached {len(formatted_history)} historical records for {symbol}.")
        return append_today_live_data(formatted_history)
        
    except Exception as ex:
        print(f"[Server] Error scraping historical data for {symbol}: {ex}")
        return []

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/scrape" or self.path.startswith("/api/scrape?"):
            print("\n[Server] Live re-scrape requested from dashboard client...")
            sx = SystemXLiteScraper()
            success = sx.scrape_all()
            if not success:
                print("[Server] SystemXLite scrape failed. Falling back to ShareSansar...")
                success = scrape_nepse()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.end_headers()
            response_data = {"success": success, "source": "SystemXLite"}
            self.wfile.write(json.dumps(response_data).encode("utf-8"))
            print("[Server] Re-scrape execution completed, sent response to client.\n")
        elif self.path.startswith("/api/history"):
            parsed_url = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            symbol = query_params.get("symbol", [None])[0]
            
            if not symbol:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Symbol parameter missing"}).encode("utf-8"))
                return
                
            print(f"\n[Server] Live price history requested for symbol: {symbol}")
            history_data = get_stock_history_from_source(symbol)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.end_headers()
            self.wfile.write(json.dumps(history_data).encode("utf-8"))
            print(f"[Server] Sent {len(history_data)} historical records for {symbol} to client.\n")
        elif self.path.startswith("/api/floorsheet"):
            try:
                parsed_url = urllib.parse.urlparse(self.path)
                query_params = urllib.parse.parse_qs(parsed_url.query)
                symbol = query_params.get("symbol", [""])[0].upper()
                buyer = query_params.get("buyer", [""])[0]
                seller = query_params.get("seller", [""])[0]
                length = int(query_params.get("length", [500])[0])
                
                print(f"\n[Server] Live floorsheet requested -> Symbol: '{symbol}', Buyer: '{buyer}', Seller: '{seller}', Length: {length}")
                records = scrape.scrape_sharesansar_floorsheet(symbol=symbol, buyer=buyer, seller=seller, length=length)
                    
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps(records).encode("utf-8"))
                print(f"[Server] Sent {len(records) if isinstance(records, list) else 0} floorsheet records to client.\n")
            except Exception as e:
                print(f"[Server] Floorsheet handler error: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

        elif self.path == "/api/live-tick" or self.path.startswith("/api/live-tick?"):
            # Lightweight live price refresh endpoint — fetches only stocks + indices
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            try:
                # Re-use existing token or login fresh
                login_payload = json.dumps({
                    "username": "manipandey384@gmail.com",
                    "password": "M@n1P@ndey",
                    "platform": "web"
                }).encode("utf-8")
                login_req = urllib.request.Request(
                    "https://api.npstocks.com/npstocks/v2/login",
                    data=login_payload,
                    headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Origin": "https://app.npstocks.com", "Referer": "https://app.npstocks.com/"},
                    method="POST"
                )
                with urllib.request.urlopen(login_req, context=ctx, timeout=10) as lr:
                    token = json.loads(lr.read().decode("utf-8"))["response"]["token"]

                api_headers = {
                    "Authorization": f"Bearer {token}",
                    "token": token,
                    "x-access-token": token,
                    "User-Agent": "Mozilla/5.0",
                    "Origin": "https://app.npstocks.com",
                    "Referer": "https://app.npstocks.com/"
                }

                # Fetch stock prices
                stocks_raw = []
                try:
                    sr = urllib.request.Request("https://api.npstocks.com/tv/sidebar/stock-live/stock-list", headers=api_headers)
                    with urllib.request.urlopen(sr, context=ctx, timeout=10) as resp:
                        sd = json.loads(resp.read().decode("utf-8"))
                        stocks_raw = sd.get("data", [])
                except Exception as e:
                    print(f"[LiveTick] Stock fetch error: {e}")

                # Fetch indices
                indices_raw = []
                try:
                    ir = urllib.request.Request("https://api.npstocks.com/tv/sidebar/indices-live/indices-list", headers=api_headers)
                    with urllib.request.urlopen(ir, context=ctx, timeout=10) as resp:
                        idx_data = json.loads(resp.read().decode("utf-8"))
                        indices_raw = idx_data.get("data", [])
                except Exception as e:
                    print(f"[LiveTick] Indices fetch error: {e}")

                # Convert to dashboard format
                stocks = []
                for item in stocks_raw:
                    symbol = item.get("symbol", "").strip()
                    if not symbol:
                        continue
                    ltp = float(item.get("ltp", 0) or 0)
                    point_change = float(item.get("point_change", 0) or 0)
                    pct_change = float(item.get("percentage_change", 0) or 0)
                    volume = int(item.get("volume", 0) or 0)
                    amount = float(item.get("amount", 0) or 0)
                    prev_close = ltp - point_change if ltp else 0
                    ind = compute_all_stock_indicators(symbol, ltp, volume)

                    stock_dict = {
                        "symbol": symbol,
                        "fullName": item.get("fullName", ""),
                        "sector": item.get("sector", ""),
                        "ltp": ltp,
                        "open": ltp,
                        "high": ltp,
                        "low": ltp,
                        "close": ltp,
                        "volume": volume,
                        "prev_close": round(prev_close, 2),
                        "turnover": amount,
                        "transactions": 0,
                        "diff": point_change,
                        "diff_percent": pct_change,
                        "fifty_two_week_high": ind.get("fifty_two_week_high", 0),
                        "fifty_two_week_low": ind.get("fifty_two_week_low", 0),
                        "sma20": ind.get("sma20"),
                        "dma20": ind.get("sma20"),
                        "sma50": ind.get("sma50"),
                        "rsi14": ind.get("rsi14"),
                        "diff_20sma": ind.get("diff_20sma", 0),
                        "diff_20dma": ind.get("diff_20sma", 0),
                        "diff_50sma": ind.get("diff_50sma", 0),
                        "volume_surge": ind.get("volume_surge", 1.0),
                        "is_golden_cross": ind.get("is_golden_cross", False),
                        "is_rsi_oversold": ind.get("is_rsi_oversold", False),
                        "is_rsi_overbought": ind.get("is_rsi_overbought", False),
                        "is_52w_breakout": ind.get("is_52w_breakout", False),
                        "is_volume_surge": ind.get("is_volume_surge", False),
                        "ema20": ind.get("ema20"),
                        "ema50": ind.get("ema50"),
                        "ema100": ind.get("ema100"),
                        "is_ema_aligned": ind.get("is_ema_aligned", False),
                        "fractal_low": ind.get("fractal_low"),
                        "is_fractal_sweep": ind.get("is_fractal_sweep", False),
                        "is_bullish_candle": ind.get("is_bullish_candle", False),
                        "is_ema_fractal_match": ind.get("is_ema_fractal_match", False)
                    }
                    stocks.append(stock_dict)

                tick_response = {
                    "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "date": time.strftime("%Y-%m-%d"),
                    "stocks": stocks,
                    "indices": indices_raw,
                    "total_turnover": sum(s["turnover"] for s in stocks),
                    "total_volume": sum(s["volume"] for s in stocks),
                    "total_traded_companies": len(stocks),
                    "advancers": sum(1 for s in stocks if s["diff"] > 0),
                    "decliners": sum(1 for s in stocks if s["diff"] < 0),
                    "unchanged": sum(1 for s in stocks if s["diff"] == 0),
                }

                # Also persist to disk so file-based loads stay fresh
                dashboard_file = os.path.join(DIRECTORY, "data", "nepse_today.json")
                with open(dashboard_file, "w", encoding="utf-8") as f:
                    json.dump(tick_response, f, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps(tick_response).encode("utf-8"))
                print(f"[LiveTick] Sent {len(stocks)} stocks + {len(indices_raw)} indices at {tick_response['scraped_at']}")

            except Exception as e:
                import traceback
                print(f"[LiveTick] Error: {e}")
                traceback.print_exc()
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                except Exception:
                    pass

        elif self.path == "/api/all-tickers" or self.path.startswith("/api/all-tickers?"):
            # Returns a static master ticker list from nepalstock.com merged with live data
            master_file = os.path.join(DIRECTORY, "data", "nepse_master_tickers.json")
            tickers = []
            if os.path.exists(master_file):
                with open(master_file, "r", encoding="utf-8") as f:
                    tickers = json.load(f)
            else:
                # Fallback to whatever we have in live data
                today_file = os.path.join(DIRECTORY, "data", "nepse_today.json")
                if os.path.exists(today_file):
                    with open(today_file, "r", encoding="utf-8") as f:
                        today = json.load(f)
                    tickers = [{"symbol": s["symbol"], "sector": s.get("sector", ""), "fullName": s.get("fullName", "")} for s in today.get("stocks", [])]

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(json.dumps(tickers).encode("utf-8"))

        else:
            super().do_GET()

def start_server(ready_event):
    global PORT
    for try_port in range(8085, 8100):
        try:
            socketserver.TCPServer.allow_reuse_address = True
            httpd = socketserver.TCPServer(("", try_port), Handler)
            PORT = try_port
            print(f"\n[Server] Dashboard server started at http://localhost:{PORT}/")
            print("[Server] Press Ctrl+C in this terminal to stop the server.")
            ready_event.set()
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n[Server] Stopping server...")
            return
        except OSError as e:
            if e.errno in (48, 98):  # Address already in use
                continue
            raise e

def background_autoscrape():
    """Background daemon thread that continuously scrapes live prices, sub-indices, turnover & signals every 30 seconds."""
    time.sleep(30)
    sx = SystemXLiteScraper()
    while True:
        try:
            print(f"\n[AutoScraper 30s] [{time.strftime('%H:%M:%S')}] Scraping live turnover, sub-indices & price updates...")
            sx.scrape_all()
        except Exception as e:
            print(f"[AutoScraper 30s] Error during auto-scrape: {e}")
        time.sleep(30)

def main():
    print("=" * 60)
    print("      NEPSE & SYSTEMXLITE SCRAPER & TERMINAL DASHBOARD         ")
    print("=" * 60)
    
    # 1. Scrape latest NEPSE data from SystemXLite
    print("\n[1/3] Fetching latest NEPSE share prices & signals from SystemXLite...")
    sx = SystemXLiteScraper()
    success = sx.scrape_all()
    if not success:
        print("\n[Warning] SystemXLite scraping failed. Trying ShareSansar fallback...")
        success = scrape_nepse()

    if not success:
        print("\n[Warning] All scraping methods failed or completed with errors.")
        print("Starting server anyway to display cached data if available...\n")
    else:
        print("\n[2/3] Scraping completed successfully! Data saved to data/ directory.")
        
    # 2. Start HTTP server in a separate thread
    print("\n[3/3] Launching web server...")
    server_ready = threading.Event()
    server_thread = threading.Thread(target=start_server, args=(server_ready,))
    server_thread.daemon = True
    server_thread.start()
    
    # Wait for server to bind port
    server_ready.wait(timeout=10)
    
    # 3. Start 30-second continuous background auto-scraper thread
    autoscrape_thread = threading.Thread(target=background_autoscrape)
    autoscrape_thread.daemon = True
    autoscrape_thread.start()
    print("\n[AutoScraper 30s] Continuous 30-second background scraper thread active!")

    # 4. Open browser
    dashboard_url = f"http://localhost:{PORT}/index.html"
    print(f"\n[Browser] Opening dashboard in browser: {dashboard_url}")
    webbrowser.open(dashboard_url)
    
    # Keep main thread alive to allow Ctrl+C to terminate
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting. Thank you for using NEPSE & SystemXLite Scraper!")



if __name__ == "__main__":
    main()
