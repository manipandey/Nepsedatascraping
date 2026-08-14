import re
with open('app.js', 'r') as f:
    js = f.read()

# I will find "if (view === 'floorsheet'" and replace up to the end of the block.
start = js.find("if (view === 'floorsheet'")
end = js.find("        }\n    });\n});", start)

good_toggle = """if (view === 'floorsheet' && document.getElementById('floorsheetView')) {
                document.getElementById('floorsheetView').classList.remove('hidden');
                document.getElementById('floorsheetView').style.display = 'block';
            } else if (view === 'bubble' && document.getElementById('bubbleView')) {
                document.getElementById('bubbleView').classList.remove('hidden');
                document.getElementById('bubbleView').style.display = 'flex'; // It's a flex container! Wait, block is fine. Let's use ''
                document.getElementById('bubbleView').style.display = ''; 
                if (typeof renderBubbleChart === 'function') renderBubbleChart();
            } else if (view === 'chart' && document.getElementById('chartView')) {
                document.getElementById('chartView').classList.remove('hidden');
                document.getElementById('chartView').style.display = '';
                if (typeof tvFullScreenWidget !== 'undefined' && tvFullScreenWidget) tvFullScreenWidget.resize();
            } else if (view === 'portfolio' && document.getElementById('portfolioView')) {
                document.getElementById('portfolioView').classList.remove('hidden');
                document.getElementById('portfolioView').style.display = '';
                renderPortfolio();
            }
"""

js = js[:start] + good_toggle + js[end:]

with open('app.js', 'w') as f:
    f.write(js)
print("Toggle logic force fixed")
