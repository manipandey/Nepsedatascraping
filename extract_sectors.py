import re

with open('index.html.npstocks.bak', 'r') as f:
    html = f.read()

# Find indicesSection
match = re.search(r'<div id="indicesSection"[\s\S]*?(?=<!-- TABLE VIEW -->)', html)
if match:
    print(match.group(0))
