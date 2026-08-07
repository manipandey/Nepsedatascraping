#!/usr/bin/env python3
"""
SystemXLite / NP Stocks Scraper
--------------------------------
Authenticates with app.npstocks.com API and scrapes:
1. Live Market Prices & Sectors
2. Dalal Street Signals (Floorsheet Jasoos, Last Min Movers, Top Bought/Sold Stocks)
3. User SystemX Portfolio & Watchlist
4. Lock-in Period & Announcements
5. Mutual Fund Metrics

Saves output to structured JSON and CSV in the data/ directory.
"""

import os
import sys
import json
import csv
import ssl
import urllib.request
from datetime import datetime

# Path setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_USERNAME = "manipandey384@gmail.com"
DEFAULT_PASSWORD = "M@n1P@ndey"
API_BASE_URL = "https://api.npstocks.com"

def compute_stock_20dma(symbol, current_ltp):
    symbol = symbol.upper().strip()
    cache_file = os.path.join(DATA_DIR, "history_cache", f"{symbol.lower()}.json")
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
                    dma20 = sum(closes) / len(closes)
                    return round(dma20, 2)
        except Exception as e:
            pass
    return None


class SystemXLiteScraper:
    def __init__(self, username=DEFAULT_USERNAME, password=DEFAULT_PASSWORD):
        self.username = username
        self.password = password
        self.token = None
        self.user_id = None
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE

    def login(self):
        """Authenticates with SystemXLite API and returns JWT token."""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Logging into SystemXLite (NP Stocks) as {self.username}...")
        login_url = f"{API_BASE_URL}/npstocks/v2/login"
        payload = json.dumps({
            "username": self.username,
            "password": self.password,
            "platform": "web"
        }).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Origin": "https://app.npstocks.com",
            "Referer": "https://app.npstocks.com/"
        }

        req = urllib.request.Request(login_url, data=payload, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, context=self.ctx, timeout=15) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                if res_data.get("status") == "success" and "response" in res_data:
                    self.token = res_data["response"].get("token")
                    self.user_id = res_data["response"].get("userId")
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Login successful! User ID: {self.user_id}")
                    return True
                else:
                    print(f"Login failed: {res_data}")
                    return False
        except Exception as e:
            print(f"Error during login: {e}")
            if hasattr(e, "read"):
                print("Response detail:", e.read().decode("utf-8"))
            return False

    def _get_headers(self):
        """Returns standard authentication headers."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Origin": "https://app.npstocks.com",
            "Referer": "https://app.npstocks.com/"
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            headers["token"] = self.token
            headers["x-access-token"] = self.token
        return headers

    def fetch_json(self, endpoint):
        """Helper to GET JSON from endpoint."""
        url = endpoint if endpoint.startswith("http") else f"{API_BASE_URL}{endpoint}"
        req = urllib.request.Request(url, headers=self._get_headers())
        try:
            with urllib.request.urlopen(req, context=self.ctx, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data
        except Exception as e:
            print(f"Failed to fetch {endpoint}: {e}")
            return None

    def scrape_all(self):
        """Main scraping coordinator."""
        if not self.token and not self.login():
            print("Aborting scrape due to authentication failure.")
            return False

        scraped_dataset = {
            "scraped_at": datetime.now().isoformat(),
            "user_id": self.user_id,
            "indices": [],
            "stock_live": [],
            "sectors": [],
            "floorsheet_jasoos": {},
            "last_min_movers": [],
            "popular_stocks": {},
            "performance_metrics": {},
            "portfolio": [],
            "watchlist": [],
            "lock_in_periods": [],
            "mutual_funds": {},
            "announcements": []
        }

        # 0. Indices Data
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching Live Sub-Indices & Market Summary...")
        res_indices = self.fetch_json("/tv/sidebar/indices-live/indices-list")
        if res_indices and "data" in res_indices:
            scraped_dataset["indices"] = res_indices["data"]
            print(f" -> Scraped {len(res_indices['data'])} indices.")

        # 1. Stock Live & Sectors
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching Live Stock Prices & Sectors...")

        res_stocks = self.fetch_json("/tv/sidebar/stock-live/stock-list")
        if res_stocks and "data" in res_stocks:
            raw_stocks = res_stocks["data"]
            cache_dir = os.path.join(DATA_DIR, "history_cache")

            for s in raw_stocks:
                sym = s.get("symbol", "").upper().strip()
                ltp = float(s.get("ltp", 0) or 0)
                vol = float(s.get("volume", 0) or 0)
                if sym:
                    ind = self.compute_indicators(sym, ltp, vol, cache_dir)
                    s.update(ind)

            scraped_dataset["stock_live"] = raw_stocks
            print(f" -> Scraped & enriched technical indicators for {len(raw_stocks)} stock symbols.")

        res_sectors = self.fetch_json("/tv/sidebar/stock-live/sector-list")
        if res_sectors and "data" in res_sectors:
            scraped_dataset["sectors"] = res_sectors["data"]

        # 2. Dalal Street Signals
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching Dalal Street Signals...")
        res_jasoos = self.fetch_json("/npstocks/dalalstreet/getFloorsheetJasoos")
        if res_jasoos and isinstance(res_jasoos, dict) and "data" in res_jasoos and isinstance(res_jasoos["data"], dict):
            scraped_dataset["floorsheet_jasoos"] = res_jasoos["data"]
            print(f" -> Scraped Floorsheet Jasoos: {list(res_jasoos['data'].keys())}")

        res_movers = self.fetch_json("/npstocks/dalalstreet/getLastMinMovers")
        if res_movers and isinstance(res_movers, dict) and "data" in res_movers and isinstance(res_movers["data"], dict):
            scraped_dataset["last_min_movers"] = res_movers["data"].get("lastMinMovers", [])
            print(f" -> Scraped Last Min Movers: {len(scraped_dataset['last_min_movers'])}")

        res_popular = self.fetch_json("/npstocks/dalalstreet/getPopularStocks")
        if res_popular and isinstance(res_popular, dict) and "data" in res_popular and isinstance(res_popular["data"], dict):
            scraped_dataset["popular_stocks"] = res_popular["data"]
            print(f" -> Scraped Popular Stocks: {list(res_popular['data'].keys())}")

        # 3. Market Performance & Lock-in
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching Performance Metrics & Lock-in Periods...")
        res_perf = self.fetch_json("/npstocks/market-overview/performance-metrics")
        if res_perf and isinstance(res_perf, dict) and "data" in res_perf and isinstance(res_perf["data"], dict):
            scraped_dataset["performance_metrics"] = res_perf["data"]

        res_lockin = self.fetch_json("/npstocks/financial-overview/lock-in-period")
        if res_lockin and "data" in res_lockin:
            scraped_dataset["lock_in_periods"] = res_lockin["data"]

        # 4. User Portfolio & Watchlist
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching User Portfolio & Watchlist...")
        res_port = self.fetch_json("/api/mainserver/systemxweb/portfolio/list")
        if res_port and "message" in res_port:
            scraped_dataset["portfolio"] = res_port["message"]

        res_watch = self.fetch_json("/npstocks/watchlist")
        if res_watch and "response" in res_watch:
            scraped_dataset["watchlist"] = res_watch["response"]

        # 5. Mutual Funds & Announcements
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching Mutual Funds & Announcements...")
        res_mf = self.fetch_json("/npstocks/mf-overview")
        if res_mf and "data" in res_mf:
            scraped_dataset["mutual_funds"] = res_mf["data"]

        res_ann = self.fetch_json("/npstocks/announcement/all")
        if res_ann and "data" in res_ann:
            scraped_dataset["announcements"] = res_ann["data"][:50]

        # Save to JSON
        json_path = os.path.join(DATA_DIR, "systemx_scraped.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(scraped_dataset, f, indent=2)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Complete SystemXLite JSON saved to: {json_path}")

        # Save CSV for live stocks
        if scraped_dataset["stock_live"]:
            csv_path = os.path.join(DATA_DIR, "systemx_today.csv")
            fieldnames = ["symbol", "fullName", "sector", "ltp", "point_change", "percentage_change", "volume", "amount"]
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for stock in scraped_dataset["stock_live"]:
                    writer.writerow({k: stock.get(k, "") for k in fieldnames})
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Live Stock Prices CSV saved to: {csv_path}")

        # Also update nepse_today.json in standard format for terminal dashboard integration
        self._update_standard_dashboard(scraped_dataset)

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraping completed successfully!")
        return True

    def compute_indicators(self, symbol, current_ltp, current_vol, cache_dir):
        cache_file = os.path.join(cache_dir, f"{symbol.lower()}.json")
        if not os.path.exists(cache_file):
            return {}

        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                history = json.load(f)

            if len(history) < 5:
                return {}

            closes = [float(h.get("close", 0) or 0) for h in history if h.get("close")]
            highs = [float(h.get("high", 0) or 0) for h in history if h.get("high")]
            lows = [float(h.get("low", 0) or 0) for h in history if h.get("low")]
            opens = [float(h.get("open", 0) or 0) for h in history if h.get("open")]
            volumes = [float(h.get("volume", 0) or 0) for h in history if h.get("volume")]

            if current_ltp > 0:
                closes.append(current_ltp)
                highs.append(max(current_ltp, highs[-1] if highs else current_ltp))
                lows.append(min(current_ltp, lows[-1] if lows else current_ltp))
                opens.append(current_ltp)
                if current_vol > 0:
                    volumes.append(current_vol)

            def calc_ema(arr, period):
                if len(arr) < period:
                    return None
                k = 2.0 / (period + 1)
                ema = sum(arr[:period]) / float(period)
                for price in arr[period:]:
                    ema = (price * k) + (ema * (1.0 - k))
                return round(ema, 2)

            def calc_sma(arr, period):
                if len(arr) < period:
                    return None
                return round(sum(arr[-period:]) / float(period), 2)

            def calc_rsi(arr, period=14):
                if len(arr) < period + 1:
                    return None
                gains = []
                losses = []
                for i in range(1, len(arr)):
                    change = arr[i] - arr[i-1]
                    if change > 0:
                        gains.append(change)
                        losses.append(0)
                    else:
                        gains.append(0)
                        losses.append(abs(change))
                if len(gains) < period:
                    return None
                avg_gain = sum(gains[:period]) / float(period)
                avg_loss = sum(losses[:period]) / float(period)
                for i in range(period, len(gains)):
                    avg_gain = (avg_gain * (period - 1) + gains[i]) / float(period)
                    avg_loss = (avg_loss * (period - 1) + losses[i]) / float(period)
                if avg_loss == 0:
                    return 100.0
                rs = avg_gain / avg_loss
                rsi = 100.0 - (100.0 / (1.0 + rs))
                return round(rsi, 2)

            sma20_val = calc_sma(closes, 20)
            sma50_val = calc_sma(closes, 50)
            rsi14_val = calc_rsi(closes, 14)

            ema20_val = calc_ema(closes, 20) or sma20_val
            ema50_val = calc_ema(closes, 50) or sma50_val
            ema100_val = calc_ema(closes, 100) or calc_sma(closes, 100)

            diff_20sma = round(current_ltp - sma20_val, 2) if sma20_val else 0.0
            diff_50sma = round(current_ltp - sma50_val, 2) if sma50_val else 0.0

            fifty_two_high = max(highs[-252:]) if len(highs) >= 252 else max(highs)
            fifty_two_low = min(lows[-252:]) if len(lows) >= 252 else min(lows)

            avg_vol_20 = sum(volumes[-20:]) / float(min(len(volumes), 20)) if volumes else 1.0
            vol_surge = round(current_vol / avg_vol_20, 2) if avg_vol_20 > 0 else 1.0

            is_golden_cross = bool(sma20_val and sma50_val and sma20_val >= sma50_val)
            is_rsi_oversold = bool(rsi14_val and rsi14_val <= 45)
            is_rsi_overbought = bool(rsi14_val and rsi14_val >= 55)
            is_52w_breakout = bool(current_ltp >= fifty_two_high * 0.98)
            is_volume_surge = bool(vol_surge >= 1.2)

            is_ema_aligned = bool(ema20_val and ema50_val and ema100_val and ema20_val >= ema50_val and ema50_val >= ema100_val)

            fractal_low_val = None
            is_fractal_sweep = False
            is_bullish_candle = False
            if len(lows) >= 5:
                for i in range(len(lows)-3, 1, -1):
                    if lows[i] < lows[i-1] and lows[i] < lows[i-2] and lows[i] < lows[i+1] and lows[i] < lows[i+2]:
                        fractal_low_val = round(lows[i], 2)
                        break

            if fractal_low_val is None and len(lows) >= 3:
                fractal_low_val = round(min(lows[-10:]), 2)

            if fractal_low_val and current_ltp:
                recent_min_low = min(lows[-3:]) if len(lows) >= 3 else current_ltp
                if recent_min_low <= fractal_low_val or current_ltp <= fractal_low_val * 1.01:
                    is_fractal_sweep = True

            if len(closes) >= 1 and len(opens) >= 1:
                is_bullish_candle = bool(closes[-1] >= opens[-1])
            else:
                is_bullish_candle = True

            is_ema_fractal_match = bool(is_ema_aligned and is_fractal_sweep and is_bullish_candle)

            return {
                "fifty_two_week_high": round(fifty_two_high, 2),
                "fifty_two_week_low": round(fifty_two_low, 2),
                "sma20": sma20_val,
                "sma50": sma50_val,
                "rsi14": rsi14_val,
                "ema20": ema20_val,
                "ema50": ema50_val,
                "ema100": ema100_val,
                "diff_20sma": diff_20sma,
                "diff_50sma": diff_50sma,
                "volume_surge": vol_surge,
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

    def _update_standard_dashboard(self, scraped_dataset):
        """Converts SystemXLite data into nepse_today.json format for local web dashboard compatibility."""
        stocks = []
        for item in scraped_dataset["stock_live"]:
            symbol = item.get("symbol", "").strip()
            if not symbol:
                continue

            ltp = float(item.get("ltp", 0.0) or 0.0)
            point_change = float(item.get("point_change", 0.0) or 0.0)
            pct_change = float(item.get("percentage_change", 0.0) or 0.0)
            volume = int(item.get("volume", 0) or 0)
            amount = float(item.get("amount", 0.0) or 0.0)
            prev_close = ltp - point_change if ltp else 0.0

            stock_item = dict(item)
            stock_item.update({
                "symbol": symbol,
                "open": item.get("open") or ltp,
                "high": item.get("high") or ltp,
                "low": item.get("low") or ltp,
                "close": item.get("close") or ltp,
                "ltp": ltp,
                "volume": volume,
                "prev_close": round(prev_close, 2),
                "turnover": amount,
                "diff": point_change,
                "diff_percent": pct_change,
                "sma20": item.get("sma20"),
                "dma20": item.get("sma20"),
                "sma50": item.get("sma50"),
                "rsi14": item.get("rsi14"),
                "diff_20sma": item.get("diff_20sma", 0),
                "diff_20dma": item.get("diff_20sma", 0),
                "diff_50sma": item.get("diff_50sma", 0),
                "volume_surge": item.get("volume_surge", 1.0),
                "is_golden_cross": item.get("is_golden_cross", False),
                "is_rsi_oversold": item.get("is_rsi_oversold", False),
                "is_rsi_overbought": item.get("is_rsi_overbought", False),
                "is_52w_breakout": item.get("is_52w_breakout", False),
                "is_volume_surge": item.get("is_volume_surge", False),
                "ema20": item.get("ema20"),
                "ema50": item.get("ema50"),
                "ema100": item.get("ema100"),
                "is_ema_aligned": item.get("is_ema_aligned", False),
                "fractal_low": item.get("fractal_low"),
                "is_fractal_sweep": item.get("is_fractal_sweep", False),
                "is_bullish_candle": item.get("is_bullish_candle", False),
                "is_ema_fractal_match": item.get("is_ema_fractal_match", False)
            })
            stocks.append(stock_item)

        summary = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "scraped_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "source": "SystemXLite / NP Stocks API",
            "indices": scraped_dataset.get("indices", []),
            "total_turnover": sum(s["turnover"] for s in stocks),
            "total_volume": sum(s["volume"] for s in stocks),
            "total_transactions": 0,
            "total_traded_companies": len(stocks),
            "advancers": sum(1 for s in stocks if s["diff"] > 0),
            "decliners": sum(1 for s in stocks if s["diff"] < 0),
            "unchanged": sum(1 for s in stocks if s["diff"] == 0),
            "stocks": stocks
        }


        dashboard_file = os.path.join(DATA_DIR, "nepse_today.json")
        with open(dashboard_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)

        dashboard_csv = os.path.join(DATA_DIR, "nepse_today.csv")
        fieldnames = ["symbol", "open", "high", "low", "close", "ltp", "volume", "prev_close", "turnover", "transactions", "diff", "diff_percent", "fifty_two_week_high", "fifty_two_week_low", "confidence", "dma20", "diff_20dma", "below_20dma"]
        with open(dashboard_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(stocks)

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Standard dashboard files (nepse_today.json & nepse_today.csv) updated!")


if __name__ == "__main__":
    username = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_USERNAME
    password = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PASSWORD
    scraper = SystemXLiteScraper(username=username, password=password)
    scraper.scrape_all()
