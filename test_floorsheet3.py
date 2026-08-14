import urllib.request
import ssl
import re
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor

url = "https://www.sharesansar.com/floorsheet"
headers = {"User-Agent": "Mozilla/5.0"}
context = ssl._create_unverified_context()
opener = urllib.request.build_opener(
    HTTPCookieProcessor(CookieJar()),
    urllib.request.HTTPSHandler(context=context)
)
with opener.open(urllib.request.Request(url, headers=headers)) as response:
    html = response.read().decode('utf-8')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE)
    for script in scripts:
        if 'dataTable' in script or 'ajax' in script:
            print("--- SCRIPT BLOCK ---")
            print(script[:1000])
