import urllib.request
import ssl
import re

url = "https://merolagani.com/Floorsheet.aspx?symbol=ADBL"
headers = {"User-Agent": "Mozilla/5.0"}
context = ssl._create_unverified_context()

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req, context=context, timeout=10) as res:
    html = res.read().decode('utf-8')

tbody_m = re.search(r'<tbody>(.*?)</tbody>', html, re.DOTALL)
if tbody_m:
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody_m.group(1), re.DOTALL)
    for i, row in enumerate(rows[:5]):
        cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL)
        cleaned = [re.sub(r'<[^>]+>', '', c).strip().replace(',', '') for c in cells]
        print(cleaned)
