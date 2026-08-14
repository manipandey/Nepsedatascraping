with open('index.html', 'r') as f:
    html = f.read()

history_search = """                        <table id="historyTable">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Type</th>
                                    <th>Qty</th>
                                    <th>Entry</th>
                                    <th>Exit</th>
                                    <th>P/L (Rs)</th>
                                    <th>Gain %</th>
                                    <th>Date</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>"""
history_replace = """                        <table id="historyTable">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Type</th>
                                    <th>Qty</th>
                                    <th>Entry</th>
                                    <th>Exit</th>
                                    <th>P/L (Rs)</th>
                                    <th>Gain %</th>
                                    <th>Date</th>
                                    <th>Held</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>"""
if history_search in html:
    html = html.replace(history_search, history_replace)
    with open('index.html', 'w') as f:
        f.write(html)
    print("Fixed history headers")
else:
    print("Could not find history headers")
