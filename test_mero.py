import urllib.request
import ssl
import re

url = "https://merolagani.com/Floorsheet.aspx"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
context = ssl._create_unverified_context()
try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=context, timeout=10) as res:
        html = res.read().decode('utf-8')
        print("Success! Length:", len(html))
        if "table" in html:
            print("Found table.")
except Exception as e:
    print("Error:", e)
