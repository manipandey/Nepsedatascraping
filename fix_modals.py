with open('index.html.npstocks.bak', 'r') as f:
    bakHtml = f.read()

# Extract logTradeDialog
start = bakHtml.find('<div id="logTradeDialog"')
end = bakHtml.find('<!-- Tooltip for D3 -->', start)
logTradeDialog = bakHtml[start:end].strip()

# Extract bubbleTooltip
start2 = bakHtml.find('<div id="bubbleTooltip"')
end2 = bakHtml.find('</div>', start2) + 6
bubbleTooltip = bakHtml[start2:end2].strip()

injection = f"\n    {logTradeDialog}\n\n    <!-- Tooltip for D3 -->\n    {bubbleTooltip}\n"

with open('index.html', 'r') as f:
    html = f.read()

html = html.replace('    </dialog>', '    </dialog>\n' + injection)

with open('index.html', 'w') as f:
    f.write(html)
print("Injected modals correctly")
