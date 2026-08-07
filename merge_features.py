import re

# 1. Merge HTML
with open('index.html', 'r') as f:
    old_html = f.read()

with open('index.html.npstocks.bak', 'r') as f:
    bak_html = f.read()

# Extract Views
bubble_match = re.search(r'<!-- BUBBLE MAP VIEW -->[\s\S]*?<!-- end bubble -->', bak_html)
portfolio_match = re.search(r'<!-- PORTFOLIO VIEW -->[\s\S]*?(?=<!-- FLOORSHEET VIEW -->)', bak_html)
chart_match = re.search(r'<!-- CHART VIEW -->[\s\S]*?<!-- end chart -->', bak_html)

bubble_html = bubble_match.group(0) if bubble_match else ""
portfolio_html = portfolio_match.group(0) if portfolio_match else ""
chart_html = chart_match.group(0) if chart_match else ""

# Replace background of portfolioView card if needed, though they can stay NPStocks styled or be transparent
# We'll wrap them in div with explicit styles so they look good on dark mode without breaking it.
views_to_inject = []
if bubble_html:
    views_to_inject.append(f'<div id="bubbleView" class="view-section" style="display: none; padding: 20px;">\n{bubble_html}\n</div>')
if chart_html:
    views_to_inject.append(f'<div id="chartView" class="view-section" style="display: none; padding: 20px;">\n{chart_html}\n</div>')
if portfolio_html:
    views_to_inject.append(f'<div id="portfolioView" class="view-section" style="display: none; background: #F4F5F7; padding: 20px; border-radius: 12px; color: #111827; margin-top: 20px;">\n{portfolio_html}\n</div>')

injected = "\n\n".join(views_to_inject)

# Insert into main container
# Find </main> or end of dashboard and insert
old_html = old_html.replace('</main>', injected + '\n</main>')

# Add sidebar links
sidebar_links = """
                <li data-view="bubble" id="navBubble"> Bubble Map</li>
                <li data-view="chart" id="navChart"> Technical Chart</li>
                <li data-view="portfolio" id="navPortfolio"> Trade Journal</li>
"""
old_html = old_html.replace('id="navFloorsheet">', 'id="navFloorsheet">') 
old_html = re.sub(r'(<li data-view="floorsheet" id="navFloorsheet">.*?</li>)', r'\1' + sidebar_links, old_html)

with open('index.html', 'w') as f:
    f.write(old_html)


# 2. Merge JS
with open('app.js', 'r') as f:
    old_js = f.read()

with open('app.js.npstocks.bak', 'r') as f:
    bak_js = f.read()

# Extract functions for Bubble, Chart, and Portfolio
js_features = re.search(r'// --- BUBBLE MAP VIEW LOGIC ---[\s\S]*?(?=// --- FLOORSHEET LOGIC ---)', bak_js)
if not js_features:
    # Try just taking everything between loadChartForSymbol and fetchFloorsheetData
    pass

if js_features:
    old_js += "\n\n" + js_features.group(0)

# We need D3.js and TV scripts for Bubble and Chart!
if '<script src="https://d3js.org/d3.v7.min.js"></script>' not in old_html:
    old_html = old_html.replace('<script src="app.js', '<script src="https://d3js.org/d3.v7.min.js"></script>\n    <script src="https://s3.tradingview.com/tv.js"></script>\n    <script src="app.js')
    with open('index.html', 'w') as f:
        f.write(old_html)

# Add toggle logic to JS
# We already have a querySelectorAll in app.js
old_js = old_js.replace('if (view === "floorsheet") {', 'if (view !== "dashboard") {\n            const targetView = document.getElementById(view + "View");\n            if (targetView) targetView.style.display = "block";\n        } else if (view === "floorsheet") {')
# Wait, this is bad replacement. Let's fix it properly.
old_js = re.sub(
    r'if \(view === "floorsheet"\) \{[\s\S]*?\}\)', 
    r'''if (view !== "dashboard") {
            const targetView = document.getElementById(view + 'View');
            if (targetView) targetView.style.display = 'block';
        } else {
            const dashboard = document.querySelector('.dashboard-grid');
            if (dashboard) dashboard.style.display = 'grid';
            const table = document.getElementById('stocksTable');
            if (table) table.parentElement.style.display = 'block';
        }
    });
});''', old_js)

with open('app.js', 'w') as f:
    f.write(old_js)

# 3. Merge CSS
with open('style.css', 'r') as f:
    old_css = f.read()

with open('style.css.npstocks.bak', 'r') as f:
    bak_css = f.read()

bubble_css = re.search(r'/\* --- BUBBLE MAP CSS ---\* /[\s\S]*?(?=/\*|\Z)', bak_css)
if bubble_css:
    old_css += "\n\n" + bubble_css.group(0)
else:
    # Just grab all the CSS related to bubble and portfolio manually
    extra_css = """
/* Injected Feature CSS */
.bubble-container { width: 100%; height: 600px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
.bubble-node { stroke: #1f2937; stroke-width: 1.5px; cursor: pointer; transition: stroke-width 0.2s, filter 0.2s; }
.bubble-node:hover { stroke: #ffffff; stroke-width: 3px; filter: brightness(1.2); z-index: 10; }
.bubble-label { font-family: 'Inter', sans-serif; font-weight: 700; fill: white; text-anchor: middle; pointer-events: none; text-shadow: 0px 1px 3px rgba(0,0,0,0.5); }
.bubble-val { font-family: 'Inter', sans-serif; font-weight: 500; fill: rgba(255,255,255,0.9); text-anchor: middle; pointer-events: none; }
#portfolioView table { width: 100%; border-collapse: collapse; }
#portfolioView th { text-align: left; padding: 12px 16px; color: #6B7280; font-size: 0.85rem; border-bottom: 2px solid #F3F4F6; }
#portfolioView td { padding: 16px; font-size: 0.95rem; border-bottom: 1px solid #F3F4F6; }
"""
    old_css += extra_css

with open('style.css', 'w') as f:
    f.write(old_css)

print("Merged all features!")
