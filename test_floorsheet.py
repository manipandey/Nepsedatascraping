import urllib.request
import urllib.parse
import ssl
import re
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor

url = "https://www.sharesansar.com/floorsheet"
headers = {
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest"
}
context = ssl._create_unverified_context()
cj = CookieJar()
opener = urllib.request.build_opener(
    HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=context)
)
req = urllib.request.Request(url, headers=headers)
with opener.open(req, timeout=10) as response:
    html = response.read().decode('utf-8')
    print("Found AJAX URLs:", re.findall(r'url\s*:\s*[\'"]([^\'"]+)[\'"]', html))
