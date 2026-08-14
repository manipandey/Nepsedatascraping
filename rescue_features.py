import re

with open('app.js.npstocks.bak', 'r') as f:
    bak_js = f.read()

with open('app.js', 'r') as f:
    old_js = f.read()

# 1. Grab everything from "// Heat Bubble Map Rendering Engine (D3.js)" to "async function fetchFloorsheetData()"
start_match = re.search(r'// \-+\n// Heat Bubble Map Rendering Engine \(D3\.js\)', bak_js)
end_match = re.search(r'async function fetchFloorsheetData', bak_js)

if start_match and end_match:
    features_js = bak_js[start_match.start():end_match.start()]
    # Remove any window.addEventListener("DOMContentLoaded" or similar that might conflict, or just append it safely
    
    # Let's clean up features_js to make sure we don't have stray DOMContentLoaded
    # features_js is mostly just functions
    old_js += "\n\n" + features_js
    print("Appended logic.")
else:
    print("Could not find blocks.")

# 2. Add missing elements to cache
# Let's just append the missing ones
missing_elements = """
    // Bubble Map Elements
    navBubble: document.getElementById("navBubble"),
    bubbleView: document.getElementById("bubbleView"),
    bubbleChartContainer: document.getElementById("bubbleChartContainer"),
    bubbleTooltip: document.getElementById("bubbleTooltip"),
    btnBubbleTurnover: document.getElementById("btnBubbleTurnover"),
    btnBubbleVolume: document.getElementById("btnBubbleVolume"),
    btnBubbleGroup: document.getElementById("btnBubbleGroup"),
    
    // Technical Chart Elements
    navChart: document.getElementById("navChart"),
    chartView: document.getElementById("chartView"),
    chartContainer: document.getElementById("chartContainer"),
    chartSymbolSelect: document.getElementById("chartSymbolSelect"),
    btnClearDraw: document.getElementById("btnClearDraw"),
    
    // Portfolio / Trade Journal Elements
    navPortfolio: document.getElementById("navPortfolio"),
    portfolioView: document.getElementById("portfolioView"),
    portfolioTableBody: document.getElementById("portfolioTableBody"),
    portfolioTotalValue: document.getElementById("portfolioTotalValue"),
    portfolioTotalPL: document.getElementById("portfolioTotalPL"),
    portfolioDailyPL: document.getElementById("portfolioDailyPL"),
    btnAddTrade: document.getElementById("btnAddTrade"),
    logTradeDialog: document.getElementById("logTradeDialog"),
    closeLogTradeDialogBtn: document.getElementById("closeLogTradeDialogBtn"),
    logTradeForm: document.getElementById("logTradeForm"),
"""

old_js = old_js.replace("pivotS2: document.getElementById(\"pivotS2\"),", "pivotS2: document.getElementById(\"pivotS2\"),\n" + missing_elements)

# 3. Add to renderDashboard() so they update automatically
old_js = old_js.replace("renderIndices();", "renderIndices();\n    if (typeof renderBubbleChart === 'function') renderBubbleChart();\n    if (typeof renderPortfolio === 'function') renderPortfolio();")

with open('app.js', 'w') as f:
    f.write(old_js)

print("Done rescuing features.")
