import re

with open('index.html', 'r') as f:
    html = f.read()

sectors_html = """
            <!-- Sectors / Sub-Indices -->
            <section class="indices-panel" id="indicesSection" style="margin-bottom: 20px;">
                <h3 class="section-title">Market Sectors</h3>
                <div id="indicesGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 10px;">
                    <div class="loading">Loading sectors...</div>
                </div>
            </section>
"""
if 'id="indicesSection"' not in html:
    html = html.replace('<!-- Stock Terminal Control Panel -->', sectors_html + '\n            <!-- Stock Terminal Control Panel -->')
    with open('index.html', 'w') as f:
        f.write(html)
    print("Added indicesSection to index.html")

with open('app.js', 'r') as f:
    app_js = f.read()

with open('app.js.npstocks.bak', 'r') as f:
    bak_js = f.read()

match = re.search(r'// Render Market Sectors & Sub-Indices\nfunction renderIndices\(\) \{[\s\S]*?(?=// ---)', bak_js)
if match:
    render_code = match.group(0)
    if 'function renderIndices()' not in app_js:
        app_js += "\n\n" + render_code
        print("Injected renderIndices into app.js")

# Modify elements
if 'indicesSection: document.getElementById("indicesSection")' not in app_js:
    app_js = app_js.replace("pivotS2: document.getElementById('pivotS2'),", "pivotS2: document.getElementById('pivotS2'),\n    indicesSection: document.getElementById('indicesSection'),\n    indicesGrid: document.getElementById('indicesGrid'),")
    print("Added elements cache")
    
# Call renderIndices in initializeData()
if 'renderIndices();' not in app_js:
    app_js = app_js.replace('renderTable();', 'renderIndices();\n    renderTable();')
    print("Added renderIndices() call")
    
# Set indicesData
if 'indicesData = data.indices || [];' not in app_js:
    app_js = app_js.replace('stocksData = data.stocks;', 'stocksData = data.stocks;\n        indicesData = data.indices || [];')
    app_js = app_js.replace('let stocksData = [];', 'let stocksData = [];\nlet indicesData = [];')
    print("Added indicesData variable")

with open('app.js', 'w') as f:
    f.write(app_js)
print("Done fixing app.js")
