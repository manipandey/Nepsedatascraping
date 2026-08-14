with open('index.html', 'r') as f:
    oldHtml = f.read()

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

# Now find where to inject it in oldHtml
# We need to find the closing div of main-content.
# The structure is:
# <div class="app-container">
#     <aside class="sidebar">...</aside>
#     <div class="main-content">
#         <div class="dashboard-grid">...</div>
#         <div class="table-container">...</div>
#     </div> <!-- END OF MAIN CONTENT -->
# </div> <!-- END OF APP CONTAINER -->
# <dialog id="stockDetailDialog" ...>...</dialog>

# Let's find `<dialog id="stockDetailDialog"`
dialog_idx = oldHtml.find('<dialog id="stockDetailDialog"')
if dialog_idx == -1:
    print("Could not find dialog")
    exit(1)

# Backtrack to find the last two closing divs before dialog
# Actually, we want to inject it inside main-content, which means before the first of those two closing divs.
# Let's just find `    </div>\n</div>\n\n    <dialog`
part1 = oldHtml[:dialog_idx]
# part1 ends with the two closing divs.
# Let's find the last '</div>' in part1
last_div = part1.rfind('</div>')
second_last_div = part1.rfind('</div>', 0, last_div)

# We want to insert AFTER the table-container (which closes before second_last_div... wait)
# Just insert it exactly before second_last_div
injection = f"""
        <!-- Injected Views -->
        {floorsheet}
        {bubble}
        {chart}
        {portfolio}
"""

newHtml = part1[:second_last_div] + injection + part1[second_last_div:] + oldHtml[dialog_idx:]

with open('index.html', 'w') as f:
    f.write(newHtml)

print("Injected views successfully.")
