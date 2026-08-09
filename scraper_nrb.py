import urllib.request
import re
import json
import ssl
import os
from datetime import datetime

def scrape_nrb_data():
    url = "https://www.nrb.org.np/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    context = ssl._create_unverified_context()
    req = urllib.request.Request(url, headers=headers)
    
    indicators = []
    try:
        with urllib.request.urlopen(req, context=context) as response:
            html = response.read().decode('utf-8')
            
        pattern = r'<span class="carousel-info-value">\s*(.*?)\s*</span>.*?<div class="carousel-title">(.*?)</div>.*?<div class="carousel-date">(.*?)</div>'
        matches = re.findall(pattern, html, re.DOTALL)
        
        for val, title, date in matches:
            val_clean = val.strip()
            title_clean = re.sub(r'\s+', ' ', re.sub('<[^<]+?>', '', title)).strip()
            date_clean = re.sub(r'\s+', ' ', re.sub('<[^<]+?>', '', date)).strip()
            indicators.append({
                "title": title_clean,
                "value": val_clean,
                "date": date_clean
            })
    except Exception as e:
        print("[Scraper NRB] Error scraping NRB indicators:", e)

    result = {
        "indicators": indicators,
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    # Cache output to data directory
    os.makedirs("data", exist_ok=True)
    with open(os.path.join("data", "nrb_indicators.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    print(f"[Scraper NRB] Successfully cached {len(indicators)} macro indicators to data/nrb_indicators.json")
    return result

if __name__ == "__main__":
    scrape_nrb_data()
