import re

with open('app.js', 'r') as f:
    js = f.read()

# 1. Update saveTrade logic
save_trade_search = """            const sl = elements.tradeSL.value ? parseFloat(elements.tradeSL.value) : null;
            const notes = elements.tradeNotes.value.trim();"""
save_trade_replace = """            const sl = elements.tradeSL.value ? parseFloat(elements.tradeSL.value) : null;
            const notes = elements.tradeNotes.value.trim();
            const dateInput = document.getElementById("tradeDate");
            const entryDate = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().split("T")[0];"""
js = js.replace(save_trade_search, save_trade_replace)

save_trade_obj_search = """                notes: notes,
                status: "ACTIVE",
                date: new Date().toISOString().split("T")[0]"""
save_trade_obj_replace = """                notes: notes,
                status: "ACTIVE",
                date: entryDate"""
js = js.replace(save_trade_obj_search, save_trade_obj_replace)


# 2. Update Active Trades HTML in renderPortfolio
active_row_search = """            return `
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
            `;"""

# I need to insert daysHeld calculation before the return statement.
# But wait, where is the return statement? It's inside `.map(t => { ... return ... })`.
# I will use regex to find the active row return block.

def replace_active(match):
    before_return = """
            const entryDateObj = new Date(t.date || new Date());
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
            `;"""
    return match.group(0).replace(active_row_search, before_return)

if active_row_search in js:
    js = js.replace(active_row_search, replace_active(re.match(r'.*', active_row_search))) # cheating hack: actually I'll just string replace it and inject the JS code.
    print("Fixed active row")
    
js = js.replace(active_row_search, """
            const entryDateObj = new Date(t.date || new Date());
            const daysHeld = Math.floor((Date.now() - entryDateObj) / (1000 * 60 * 60 * 24));
            """ + active_row_search.replace('<td class="font-bold"><span class="badge-change ${t.type === \'BUY\' ? \'bg-up val-up\' : \'bg-down val-down\'}">${t.type}</span></td>', 
            """<td class="font-bold"><span class="badge-change ${t.type === 'BUY' ? 'bg-up val-up' : 'bg-down val-down'}">${t.type}</span></td>
                    <td class="text-muted">${t.date || '-'}</td>
                    <td class="text-muted">${daysHeld}d</td>""")
            .replace('</td>\n                    <td class="text-center">', 
            """</td>
                    <td style="max-width: 150px; white-space: normal; font-size: 0.75rem; color: var(--text-secondary);">${t.notes || '-'}</td>
                    <td class="text-center">"""))


# Fix colspan in activeTrades empty state (13 columns now)
js = js.replace('<td colspan="10" class="text-center text-muted"', '<td colspan="13" class="text-center text-muted"')

with open('app.js', 'w') as f:
    f.write(js)
print("Updated app.js")
