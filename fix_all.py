import re

# 1. FIX INDEX.HTML
with open('index.html', 'r') as f:
    html = f.read()

# Fix marketAdvances and marketDeclines IDs
html = html.replace('<span class="text-success">-- Advances</span>', '<span class="text-success" id="marketAdvances">-- Advances</span>')
html = html.replace('<span class="text-danger">-- Declines</span>', '<span class="text-danger" id="marketDeclines">-- Declines</span>')

# Add indicesSection
sectors_html = """
                    <!-- Sectors / Sub-Indices -->
                    <div class="card" id="indicesSection" style="margin-top: 20px;">
                        <h3 class="section-title">Sectors / Sub-Indices</h3>
                        <div id="indicesGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;">
                            <div class="loading">Loading sectors...</div>
                        </div>
                    </div>
"""

# Insert after Market Summary card. Market summary card ends with "</div>\n                    </div>" before the end of the top-widgets div or dashboard-right-col
# Let's just find the exact string to replace.
target = """                    <div class="card">
                        <h3 class="section-title">Market Summary</h3>
                        <div class="flex-start" style="gap: 16px; flex-wrap: wrap;">
                            <div class="badge-pill">Market Breadth: <span class="text-success" id="marketAdvances">-- Advances</span> / <span class="text-danger" id="marketDeclines">-- Declines</span></div>
                            <div class="badge-pill">Total Volume: <span id="totalShares">--</span></div>
                        </div>
                    </div>"""

if target in html:
    html = html.replace(target, target + "\n" + sectors_html)
else:
    print("Could not find Market Summary card to inject after")

with open('index.html', 'w') as f:
    f.write(html)
print("Fixed index.html")

# 2. FIX APP.JS
with open('app.js', 'r') as f:
    app_js = f.read()

with open('app.js.npstocks.bak', 'r') as f:
    bak_js = f.read()

# Find renderIndices() in bak_js
match = re.search(r'// Render Market Sectors & Sub-Indices\nfunction renderIndices\(\) \{[\s\S]*?(?=// ---)', bak_js)
if match:
    render_indices_code = match.group(0)
    # Check if it's already in app.js
    if 'function renderIndices()' not in app_js:
        # Append it
        app_js += "\n\n" + render_indices_code
        print("Injected renderIndices into app.js")
    else:
        print("renderIndices already in app.js")
else:
    print("Could not find renderIndices in bak_js")

# Add elements to cache
if 'indicesSection: document.getElementById("indicesSection")' not in app_js:
    app_js = app_js.replace("pivotS2: document.getElementById(\"pivotS2\"),", "pivotS2: document.getElementById(\"pivotS2\"),\n    indicesSection: document.getElementById(\"indicesSection\"),\n    indicesGrid: document.getElementById(\"indicesGrid\"),\n    marketAdvances: document.getElementById(\"marketAdvances\"),\n    marketDeclines: document.getElementById(\"marketDeclines\"),")
    print("Added elements to cache")

with open('app.js', 'w') as f:
    f.write(app_js)

print("Done fixing everything.")
