import re

with open('index.html', 'r') as f:
    html = f.read()

with open('index.html.npstocks.bak', 'r') as f:
    bakHtml = f.read()

def get_div(id_name):
    start = bakHtml.find(f'<div id="{id_name}"')
    if start == -1: return ""
    end = bakHtml.find('<div id=', start + 10)
    if end == -1 or (id_name == 'floorsheetView' and end != -1):
        end = bakHtml.find('</main>', start)
    content = bakHtml[start:end].strip()
    if 'class="view-section hidden"' not in content:
        content = content.replace('class="view-section"', 'class="view-section hidden"')
    return content

bubble = get_div('bubbleView')
chart = get_div('chartView')
portfolio = get_div('portfolioView')
floorsheet = get_div('floorsheetView')

# 1. Inject the views before </main>
views_injection = f"""
        <!-- Injected Views -->
        {floorsheet}
        {bubble}
        {chart}
        {portfolio}
"""
html = html.replace('        </main>', views_injection + '\n        </main>')

# 2. Inject indicesSection before Control Panel
sectors_html = """
            <!-- Sectors / Sub-Indices -->
            <section class="indices-panel" id="indicesSection" style="margin-bottom: 20px;">
                <h3 class="section-title">Market Sectors</h3>
                <div id="indicesGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 10px;">
                    <div class="loading">Loading sectors...</div>
                </div>
            </section>
"""
html = html.replace('<!-- Stock Terminal Control Panel -->', sectors_html + '\n            <!-- Stock Terminal Control Panel -->')

# 3. Add IDs for marketBreadth elements if they aren't there
if 'id="marketAdvances"' not in html:
    html = html.replace('<span class="text-success">-- Advances</span>', '<span class="text-success" id="marketAdvances">-- Advances</span>')
    html = html.replace('<span class="text-danger">-- Declines</span>', '<span class="text-danger" id="marketDeclines">-- Declines</span>')

# 4. Inject sidebar links
nav_links = """
                <a href="#" class="nav-item active" data-view="dashboard">
                    <span class="nav-icon">📊</span> Market Today
                </a>
                <a href="#" class="nav-item" data-view="floorsheet">
                    <span class="nav-icon">🔍</span> Floorsheet
                </a>
                <a href="#" class="nav-item" data-view="bubble">
                    <span class="nav-icon">🔵</span> Bubble Map
                </a>
                <a href="#" class="nav-item" data-view="chart">
                    <span class="nav-icon">📈</span> Tech Chart
                </a>
                <a href="#" class="nav-item" data-view="portfolio">
                    <span class="nav-icon">📓</span> Trade Journal
                </a>
"""
# Find the exact string in HEAD index.html for nav links
nav_regex = re.compile(r'<a href="#" class="nav-item active">[\s\S]*?</a>')
html = nav_regex.sub(nav_links, html)

# 5. Add scripts and cache bust
if 'd3.v7.min.js' not in html:
    html = html.replace('<script src="app.js"></script>', '<script src="https://d3js.org/d3.v7.min.js"></script>\n    <script src="https://s3.tradingview.com/tv.js"></script>\n    <script src="app.js?v=999"></script>')

with open('index.html', 'w') as f:
    f.write(html)

print("ultimate_fix: successfully reconstructed index.html")
