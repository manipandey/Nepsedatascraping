with open('index.html', 'r') as f:
    html = f.read()

# 1. Fix Modal
modal_search = '<input type="text" id="tradeNotes" class="search-input" placeholder="Notes (Optional)">'
modal_replace = '''<input type="date" id="tradeDate" class="search-input" required>
                <input type="text" id="tradeNotes" class="search-input" placeholder="Trade Reason / Notes (Optional)">'''
html = html.replace(modal_search, modal_replace)

# 2. Fix active table headers
active_headers_search = """                        <table id="portfolioTable">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Qty</th>
                                    <th>Avg Price</th>
                                    <th>LTP</th>
                                    <th>P/L</th>
                                    <th>Action</th>
                                </tr>
                            </thead>"""
active_headers_replace = """                        <table id="portfolioTable">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Type</th>
                                    <th>Date</th>
                                    <th>Held</th>
                                    <th>Qty</th>
                                    <th>Entry</th>
                                    <th>LTP</th>
                                    <th>TP</th>
                                    <th>SL</th>
                                    <th>P/L</th>
                                    <th>Visual Tracker</th>
                                    <th>Reason</th>
                                    <th>Action</th>
                                </tr>
                            </thead>"""
if active_headers_search in html:
    html = html.replace(active_headers_search, active_headers_replace)
else:
    print("Could not find active headers")

with open('index.html', 'w') as f:
    f.write(html)
print("Updated index.html headers and modal")
