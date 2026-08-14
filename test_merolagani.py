import urllib.request
import urllib.parse
import ssl
import re
from http.cookiejar import CookieJar

def scrape_mero(symbol, max_pages=5):
    url = "https://merolagani.com/Floorsheet.aspx"
    headers = {"User-Agent": "Mozilla/5.0"}
    context = ssl._create_unverified_context()
    cj = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj),
        urllib.request.HTTPSHandler(context=context)
    )
    
    # 1. Get initial page to extract tokens
    req = urllib.request.Request(url, headers=headers)
    try:
        with opener.open(req, timeout=10) as res:
            html = res.read().decode('utf-8')
    except Exception as e:
        print("Failed initial fetch:", e)
        return []
        
    def get_token(name, html_content):
        m = re.search(r'name="' + name + r'"[^>]*value="([^"]*)"', html_content)
        if m: return m.group(1)
        m = re.search(r'value="([^"]*)"[^>]*name="' + name + r'"', html_content)
        if m: return m.group(1)
        return ""
        
    viewstate = get_token('__VIEWSTATE', html)
    generator = get_token('__VIEWSTATEGENERATOR', html)
    validation = get_token('__EVENTVALIDATION', html)
    
    # We need to simulate the "Search" button click
    post_data = {
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': generator,
        '__EVENTVALIDATION': validation,
        'ctl00$ContentPlaceHolder1$ASCompanyFilter$txtAutoSuggest': symbol,
        'ctl00$ContentPlaceHolder1$btnSearch': 'Search'
    }
    
    records = []
    
    def parse_table(html_content):
        tbody_m = re.search(r'<tbody>(.*?)</tbody>', html_content, re.DOTALL)
        if not tbody_m: return []
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody_m.group(1), re.DOTALL)
        parsed = []
        for row in rows:
            cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL)
            cleaned = [re.sub(r'<[^>]+>', '', c).strip().replace(',', '') for c in cells]
            if len(cleaned) >= 8:
                parsed.append({
                    "sn": cleaned[0],
                    "symbol": cleaned[2],
                    "buyer": cleaned[3],
                    "seller": cleaned[4],
                    "quantity": float(cleaned[5]) if cleaned[5] else 0,
                    "rate": float(cleaned[6]) if cleaned[6] else 0,
                    "amount": float(cleaned[7]) if cleaned[7] else 0
                })
        return parsed
        
    # POST to search
    try:
        data = urllib.parse.urlencode(post_data).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers)
        with opener.open(req, timeout=15) as res:
            html = res.read().decode('utf-8')
            page_records = parse_table(html)
            records.extend(page_records)
            print(f"Page 1: found {len(page_records)} records")
    except Exception as e:
        print("Search failed:", e)
        return records

    # Now loop pagination
    for page in range(2, max_pages + 1):
        viewstate = get_token('__VIEWSTATE', html)
        generator = get_token('__VIEWSTATEGENERATOR', html)
        validation = get_token('__EVENTVALIDATION', html)
        
        # Merolagani paginates by setting EVENTTARGET to 'ctl00$ContentPlaceHolder1$PagerControl1'
        # and EVENTARGUMENT to the page number. However, some sites use the exact link ID.
        # Let's try standard GridView paging: 
        # But wait, looking at the inputs in previous script, there's btnPaging.
        # Actually, let's just see if we found a pager.
        if "PagerControl1" not in html:
            break
            
        post_data = {
            '__EVENTTARGET': 'ctl00$ContentPlaceHolder1$PagerControl1',
            '__EVENTARGUMENT': str(page),
            '__VIEWSTATE': viewstate,
            '__VIEWSTATEGENERATOR': generator,
            '__EVENTVALIDATION': validation,
            'ctl00$ContentPlaceHolder1$ASCompanyFilter$txtAutoSuggest': symbol
        }
        
        try:
            data = urllib.parse.urlencode(post_data).encode('utf-8')
            req = urllib.request.Request(url, data=data, headers=headers)
            with opener.open(req, timeout=15) as res:
                html = res.read().decode('utf-8')
                page_records = parse_table(html)
                if not page_records:
                    break
                records.extend(page_records)
                print(f"Page {page}: found {len(page_records)} records")
        except Exception as e:
            print(f"Page {page} failed:", e)
            break
            
    return records

res = scrape_mero("ADBL", 3)
print(f"Total: {len(res)} records")
if res:
    print(res[0])
