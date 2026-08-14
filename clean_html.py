import re

with open('index.html', 'r') as f:
    html = f.read()

with open('index.html.npstocks.bak', 'r') as f:
    bak = f.read()

# 1. Get the clean base from index.html (everything up to the end of floorsheetView)
# Floorsheet ends with:
#                     </tbody>
#                 </table>
#             </div>
#         </div>
#
# But there might be other garbage after it.
floorsheet_end_idx = html.find('        </div>', html.find('id="floorsheetTableBody"')) + 14

clean_base = html[:floorsheet_end_idx]

# 2. Get the clean Bubble, Chart, and Portfolio from bak
bubble_match = re.search(r'<div id="bubbleView".*?<!-- end bubble -->', bak, re.DOTALL)
chart_match = re.search(r'<div id="chartView".*?<!-- end chart -->', bak, re.DOTALL)
portfolio_match = re.search(r'<div id="portfolioView"[\s\S]*?(?=<!-- FLOORSHEET VIEW -->)', bak)

# 3. Get the modals from bak
modals_match = re.search(r'<!-- Modals -->.*?(?=<script)', bak, re.DOTALL)

bubble_str = bubble_match.group(0) if bubble_match else ""
chart_str = chart_match.group(0) if chart_match else ""
portfolio_str = portfolio_match.group(0) if portfolio_match else ""
modals_str = modals_match.group(0) if modals_match else ""

# Replace their classes with "view-section hidden" to ensure they are hidden
bubble_str = bubble_str.replace('class="view-section"', 'class="view-section hidden"')
chart_str = chart_str.replace('class="view-section"', 'class="view-section hidden"')
portfolio_str = portfolio_str.replace('class="view-section"', 'class="view-section hidden"')

# Wrap portfolio slightly for dark mode contrast if needed, but for now just inject it.
# Note: In NPStocks layout it was light mode. We can just add a dark-mode class if needed later.

rebuilt = clean_base + "\n\n" + bubble_str + "\n\n" + chart_str + "\n\n" + portfolio_str + "\n\n    </main>\n\n" + modals_str + "\n\n    <script src=\"https://d3js.org/d3.v7.min.js\"></script>\n    <script src=\"https://cdn.jsdelivr.net/npm/klinecharts/dist/klinecharts.min.js\"></script>\n    <script src=\"app.js?v=6\"></script>\n</body>\n</html>"

with open('index.html', 'w') as f:
    f.write(rebuilt)
print("Rebuilt index.html perfectly.")
