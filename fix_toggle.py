import re
with open('app.js', 'r') as f:
    js = f.read()

bad_toggle = """            if (view === 'floorsheet' && document.getElementById('floorsheetView')) {
                document.getElementById('floorsheetView').classList.remove('hidden');
            } else if (view === 'bubble' && document.getElementById('bubbleView')) {
                document.getElementById('bubbleView').classList.remove('hidden');
                if (typeof renderBubbleMap === 'function') renderBubbleMap();
            } else if (view === 'chart' && document.getElementById('chartView')) {
                document.getElementById('chartView').classList.remove('hidden');
                if (tvFullScreenWidget) tvFullScreenWidget.resize();
            } else if (view === 'portfolio' && document.getElementById('portfolioView')) {
                document.getElementById('portfolioView').classList.remove('hidden');
                renderPortfolio();
            }"""

good_toggle = """            if (view === 'floorsheet' && document.getElementById('floorsheetView')) {
                document.getElementById('floorsheetView').classList.remove('hidden');
                document.getElementById('floorsheetView').style.display = 'block';
            } else if (view === 'bubble' && document.getElementById('bubbleView')) {
                document.getElementById('bubbleView').classList.remove('hidden');
                document.getElementById('bubbleView').style.display = 'block';
                if (typeof renderBubbleChart === 'function') renderBubbleChart();
            } else if (view === 'chart' && document.getElementById('chartView')) {
                document.getElementById('chartView').classList.remove('hidden');
                document.getElementById('chartView').style.display = 'block';
                if (typeof tvFullScreenWidget !== 'undefined' && tvFullScreenWidget) tvFullScreenWidget.resize();
            } else if (view === 'portfolio' && document.getElementById('portfolioView')) {
                document.getElementById('portfolioView').classList.remove('hidden');
                document.getElementById('portfolioView').style.display = 'block';
                renderPortfolio();
            }"""

if bad_toggle in js:
    js = js.replace(bad_toggle, good_toggle)
    with open('app.js', 'w') as f:
        f.write(js)
    print("Toggle logic fixed")
else:
    print("Could not find toggle logic block")
