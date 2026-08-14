import urllib.request
import ssl
import re
from bs4 import BeautifulSoup
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
    soup = BeautifulSoup(html, 'html.parser')
    for script in soup.find_all('script'):
        if script.string and ('dataTable' in script.string or 'ajax' in script.string):
            print("--- SCRIPT BLOCK ---")
            print(script.string[:500])
