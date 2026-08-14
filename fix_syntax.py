with open('app.js', 'r') as f:
    js = f.read()

bad_block = """            return `
        }).join("");"""

good_block = """            const entryDateObj = new Date(t.date || new Date());
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
            `;
        }).join("");"""

if bad_block in js:
    js = js.replace(bad_block, good_block)
    with open('app.js', 'w') as f:
        f.write(js)
    print("Syntax fixed")
else:
    print("Could not find bad block")
