import urllib.request
import urllib.parse
import ssl
import re
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor
import json

url_home = "https://www.sharesansar.com/floorsheet"
headers = {
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest"
}
context = ssl._create_unverified_context()
cj = CookieJar()
opener = urllib.request.build_opener(HTTPCookieProcessor(cj), urllib.request.HTTPSHandler(context=context))

try:
    with opener.open(urllib.request.Request(url_home, headers=headers), timeout=15) as res:
        html = res.read().decode('utf-8', errors='ignore')
except Exception as e:
    print("Error fetching home:", e)
    html = ""

token = ""
match = re.search(r'name="_token"\s+content="([^"]+)"', html)
if match: token = match.group(1)
if not token:
    match = re.search(r'content="([^"]+)"\s+name="_token"', html)
    if match: token = match.group(1)

print("Token:", token)

# Test POST to ajax endpoint
headers["X-CSRF-Token"] = token
url_ajax = "https://www.sharesansar.com/ajax-floorsheet"
data = urllib.parse.urlencode({
    "draw": "1", "start": "0", "length": "50",
    "symbol": "ADBL", "buyer": "", "seller": ""
}).encode('utf-8')

try:
    req = urllib.request.Request(url_ajax, data=data, headers=headers, method="POST")
    with opener.open(req, timeout=15) as res:
        result = res.read().decode('utf-8', errors='ignore')
        print(result[:500])
except Exception as e:
    print("AJAX Error:", e)
