import urllib.request
import urllib.parse
import ssl
import re
from http.cookiejar import CookieJar

url = "https://www.sharesansar.com/floorsheet"
headers = {
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest"
}
context = ssl._create_unverified_context()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()), urllib.request.HTTPSHandler(context=context))

query_params = {
    "draw": "1",
    "start": "0",
    "length": "50",
    "company": "ADBL",
    "buyer": "",
    "seller": "",
    "date": "",
    "_": "123456789"
}

qs = urllib.parse.urlencode(query_params)
full_url = f"{url}?{qs}"
print("URL:", full_url)
try:
    req = urllib.request.Request(full_url, headers=headers)
    with opener.open(req, timeout=10) as res:
        print("Success:", res.read().decode('utf-8')[:200])
except Exception as e:
    print("Error:", e)
