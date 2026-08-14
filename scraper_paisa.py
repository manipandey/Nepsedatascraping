import urllib.request
import re
import json
import ssl
import os
from datetime import datetime

def scrape_paisa_data():
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    context = ssl._create_unverified_context()
    
    # 1. Scrape Fixed Deposits
    fd_url = "https://paisaipaisa.com/normal-fixed-deposit?time=1&amount=500000"
    fd_req = urllib.request.Request(fd_url, headers=headers)
    fixed_deposits = []
    try:
        with urllib.request.urlopen(fd_req, context=context) as response:
            html = response.read().decode('utf-8')
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
            if match:
                data = json.loads(match.group(1))
                fixed_deposits = data.get("props", {}).get("initialState", {}).get("userAuth", {}).get("bankData", [])
    except Exception as e:
        print("[Scraper Paisa] Error fetching Fixed Deposits:", e)

    # 2. Scrape Savings Accounts
    saving_url = "https://paisaipaisa.com/saving-account"
    saving_req = urllib.request.Request(saving_url, headers=headers)
    savings_accounts = []
    try:
        with urllib.request.urlopen(saving_req, context=context) as response:
            html = response.read().decode('utf-8')
            match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
            if match:
                data = json.loads(match.group(1))
                savings_accounts = data.get("props", {}).get("initialState", {}).get("savingAccountBankScheme", {}).get("schemeList", [])
    except Exception as e:
        print("[Scraper Paisa] Error fetching Savings Accounts:", e)

    # 3. Compile and Cache Result
    result = {
        "fixed_deposits": fixed_deposits,
        "savings_accounts": savings_accounts,
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    with open(os.path.join("data", "bank_rates.json"), "w") as f:
        json.dump(result, f, indent=2)
        
    print(f"[Scraper Paisa] Successfully cached {len(fixed_deposits)} FDs and {len(savings_accounts)} Savings to data/bank_rates.json")
    return result

if __name__ == "__main__":
    scrape_paisa_data()
