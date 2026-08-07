with open('index.html', 'r') as f:
    html = f.read()

# 1. Remove nav link
import re
html = re.sub(r'<a href="#" class="nav-item" data-view="chart">[\s\S]*?</a>\s*', '', html)

# 2. Remove chartView
start = html.find('<div id="chartView"')
if start != -1:
    end = html.find('<!-- end chart -->', start) + 18
    if end != 17:
        html = html[:start] + html[end:]

with open('index.html', 'w') as f:
    f.write(html)
print("Removed chart from index.html")

with open('app.js', 'r') as f:
    js = f.read()

# Remove chartView from extraViews
js = js.replace("'chartView', ", "")
with open('app.js', 'w') as f:
    f.write(js)
print("Removed chart from app.js")
