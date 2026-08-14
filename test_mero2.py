import urllib.request
import ssl
import re

url = "https://merolagani.com/Floorsheet.aspx"
headers = {"User-Agent": "Mozilla/5.0"}
context = ssl._create_unverified_context()
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req, context=context) as res:
    html = res.read().decode('utf-8')
    inputs = re.findall(r'<input[^>]+name="([^"]+)"[^>]*>', html)
    print("Inputs:", inputs)
    
    # Let's extract the first few rows of the table
    tbody_match = re.search(r'<tbody>(.*?)</tbody>', html, re.DOTALL)
    if tbody_match:
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody_match.group(1), re.DOTALL)
        for i, row in enumerate(rows[:2]):
            cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL)
            cleaned = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
            print(f"Row {i+1}:", cleaned)
