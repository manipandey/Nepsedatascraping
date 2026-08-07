import re

with open('index.html.npstocks.bak', 'r') as f:
    html = f.read()

# Let's search for "Sub-Indices" or similar text
match = re.search(r'<div[^>]*>[\s\S]*?(?i:Sub-?Indices)[\s\S]*?</div>[\s\S]*?</div>', html)
if match:
    print(match.group(0)[:500])
else:
    print("Could not find Sub-Indices text")

