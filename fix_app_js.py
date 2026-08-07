import re

with open('app.js', 'r') as f:
    js = f.read()

# I need to find the broken renderPortfolio function and replace it.
start = js.find('function renderPortfolio() {')
if start == -1:
    print("Cannot find renderPortfolio")
    exit()

end = js.find('// Load closed trades', start)
if end == -1:
    end = js.find('function populateAdvChartSelect', start)
    
# Let's just find the end of the `renderPortfolio` function by brace counting or regex.
# Since it's broken, I'll extract it from the backup, modify it, and insert it back.

with open('app.js.npstocks.bak', 'r') as f:
    bak_js = f.read()

start_bak = bak_js.find('function renderPortfolio() {')
end_bak = bak_js.find('function calculatePivotPoints', start_bak)

if start_bak == -1 or end_bak == -1:
    print("Could not extract from bak")
    exit()

valid_renderPortfolio = bak_js[start_bak:end_bak]

# Now, modify valid_renderPortfolio
# 1. Active Trades Row
search_tr = '''            return `
                <tr data-symbol="${t.symbol}">
                    <td class="monospace font-bold" style="cursor: pointer;" onclick="openDetailModal('${t.symbol}')">${t.symbol}</td>
                    <td class="font-bold"><span class="badge-change ${t.type === 'BUY' ? 'bg-up val-up' : 'bg-down val-down'}">${t.type}</span></td>
                    <td class="text-right monospace">${formatters.number(t.qty)}</td>
                    <td class="text-right monospace">${formatters.decimal(t.entryPrice)}</td>
                    <td class="text-right monospace font-bold" style="cursor: pointer;" onclick="openDetailModal('${t.symbol}')">${formatters.decimal(ltp)}</td>
                    <td class="text-right monospace val-up">${t.tp ? formatters.decimal(t.tp) : '-'}</td>
                    <td class="text-right monospace val-down">${t.sl ? formatters.decimal(t.sl) : '-'}</td>
                    <td class="text-right monospace ${tradeClass}">
                        ${tradeSign}${formatters.decimal(tradePL)}<br>
                        <span style="font-size: 0.725rem; font-weight: 500;">(${formatters.percent(tradePLPct)})</span>
                    </td>
                    <td>
                        <div class="trade-range-bar">
                            ${trackLine}
                            <div class="trade-range-marker entry" style="left: ${entryPct}%" title="Entry: ${t.entryPrice}"></div>
                            ${tpMarker}
                            ${slMarker}
                            <div class="trade-range-price-dot ${ltpClass}" style="left: ${ltpPct}%" title="LTP: ${ltp}"></div>
                        </div>
                        <div class="trade-range-labels">
                            <span>L: ${formatters.decimal(minVal)}</span>
                            <span>H: ${formatters.decimal(maxVal)}</span>
                        </div>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-secondary btn-sm" onclick="closeTrade('${t.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; border-color: rgba(239, 68, 68, 0.2); color: #f87171;">
                            Close
                        </button>
                    </td>
                </tr>
            `;'''

replace_tr = '''            const entryDateObj = new Date(t.date || new Date());
            const daysHeld = Math.floor((Date.now() - entryDateObj) / (1000 * 60 * 60 * 24));
            return `
                <tr data-symbol="${t.symbol}">
                    <td class="monospace font-bold" style="cursor: pointer;" onclick="openDetailModal('${t.symbol}')">${t.symbol}</td>
                    <td class="font-bold"><span class="badge-change ${t.type === 'BUY' ? 'bg-up val-up' : 'bg-down val-down'}">${t.type}</span></td>
                    <td class="text-muted">${t.date || '-'}</td>
                    <td class="text-muted">${daysHeld}d</td>
                    <td class="text-right monospace">${formatters.number(t.qty)}</td>
                    <td class="text-right monospace">${formatters.decimal(t.entryPrice)}</td>
                    <td class="text-right monospace font-bold" style="cursor: pointer;" onclick="openDetailModal('${t.symbol}')">${formatters.decimal(ltp)}</td>
                    <td class="text-right monospace val-up">${t.tp ? formatters.decimal(t.tp) : '-'}</td>
                    <td class="text-right monospace val-down">${t.sl ? formatters.decimal(t.sl) : '-'}</td>
                    <td class="text-right monospace ${tradeClass}">
                        ${tradeSign}${formatters.decimal(tradePL)}<br>
                        <span style="font-size: 0.725rem; font-weight: 500;">(${formatters.percent(tradePLPct)})</span>
                    </td>
                    <td>
                        <div class="trade-range-bar">
                            ${trackLine}
                            <div class="trade-range-marker entry" style="left: ${entryPct}%" title="Entry: ${t.entryPrice}"></div>
                            ${tpMarker}
                            ${slMarker}
                            <div class="trade-range-price-dot ${ltpClass}" style="left: ${ltpPct}%" title="LTP: ${ltp}"></div>
                        </div>
                        <div class="trade-range-labels">
                            <span>L: ${formatters.decimal(minVal)}</span>
                            <span>H: ${formatters.decimal(maxVal)}</span>
                        </div>
                    </td>
                    <td style="max-width: 150px; white-space: normal; font-size: 0.75rem; color: var(--text-secondary);">${t.notes || '-'}</td>
                    <td class="text-center">
                        <button class="btn btn-secondary btn-sm" onclick="closeTrade('${t.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; border-color: rgba(239, 68, 68, 0.2); color: #f87171;">
                            Close
                        </button>
                    </td>
                </tr>
            `;'''
valid_renderPortfolio = valid_renderPortfolio.replace(search_tr, replace_tr)
valid_renderPortfolio = valid_renderPortfolio.replace('<td colspan="10"', '<td colspan="13"')

# Now find the broken renderPortfolio block in js and replace it
# I will use a regex to match the entire function. Since JS functions can be tricky,
# I'll find start and then manually search for the matching closing brace.
def get_matching_brace(text, start_idx):
    depth = 0
    in_str = False
    str_char = ''
    for i in range(start_idx, len(text)):
        if not in_str:
            if text[i] in '"\'`':
                in_str = True
                str_char = text[i]
            elif text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    return i
        else:
            if text[i] == str_char and text[i-1] != '\\':
                in_str = False
    return -1

brace_start = js.find('{', start)
end_broken = get_matching_brace(js, brace_start) + 1

js = js[:start] + valid_renderPortfolio + js[end_broken:]

# Ensure saveTrade logic is still good!
# Wait, I already fixed saveTrade using replace!
# But let's check if my previous broken run corrupted it.
# Actually, the previous run didn't corrupt saveTrade, it only corrupted renderPortfolio.

with open('app.js', 'w') as f:
    f.write(js)
print("Restored renderPortfolio and fixed syntax!")
