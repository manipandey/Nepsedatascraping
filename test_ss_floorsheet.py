import urllib.request
import urllib.parse
import ssl
import re
from http.cookiejar import CookieJar

url = "https://www.sharesansar.com/floorsheet"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive"
}

context = ssl._create_unverified_context()
cj = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj), urllib.request.HTTPSHandler(context=context))

try:
    req = urllib.request.Request(url, headers=headers)
    with opener.open(req, timeout=10) as res:
        html = res.read().decode('utf-8')
        
    print("Fetched Home!")
    
    # Extract CSRF token
    token_match = re.search(r'name="_token" content="([^"]+)"', html)
    token = token_match.group(1) if token_match else None
    print("Token:", token)
    
    if token:
        # POST to DataTables endpoint (it's often the same URL or /floorsheet for ajax)
        # We look for "ajax: {"url": "..."}" in the script
        ajax_match = re.search(r'ajax\s*:\s*\{\s*url\s*:\s*[\'"]([^\'"]+)[\'"]', html)
        ajax_url = ajax_match.group(1) if ajax_match else url
        print("Ajax URL:", ajax_url)
        
        post_data = {
            '_token': token,
            'draw': '1',
            'start': '0',
            'length': '50',
            'company': 'ADBL',
            'buyer': '',
            'seller': '',
            'date': ''
        }
        
        post_headers = headers.copy()
        post_headers.update({
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        })
        
        data = urllib.parse.urlencode(post_data).encode('utf-8')
        ajax_req = urllib.request.Request(ajax_url, data=data, headers=post_headers, method="POST")
        with opener.open(ajax_req, timeout=10) as res2:
            resp = res2.read().decode('utf-8')
            print("Response:", resp[:200])
except Exception as e:
    print("Error:", e)
