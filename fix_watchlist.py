with open('app.js', 'r') as f:
    js = f.read()

bad_block = """    if (watchlist.length === 0) {
        elements.watchlistList.innerHTML = `
            <div class="watchlist-empty">
                <div class="watchlist-empty-icon">☆</div>
                <p>Your watchlist is empty.</p>
                <p class="watchlist-empty-sub">Star stocks from the Market Today table to add them here.</p>
            </div>
        `;
    } else {
        elements.watchlistList.innerHTML = watchlist.map(sym => {
            const stock = stocksData.find(s => s.symbol === sym) || { close: 0, diff: 0, diff_percent: 0 };
            const diffClass = stock.diff > 0 ? "val-up" : (stock.diff < 0 ? "val-down" : "val-flat");
            const caret = stock.diff > 0 ? "▲" : (stock.diff < 0 ? "▼" : "=");
            const alert = priceAlerts[sym] || {};
            const hasAlert = alert.above || alert.below;
            const alertBellClass = hasAlert ? "watchlist-alert-btn active" : "watchlist-alert-btn";
            const alertBellTitle = hasAlert
                ? `Alert set: ${alert.above ? '↑ ' + alert.above : ''}${alert.above && alert.below ? ' / ' : ''}${alert.below ? '↓ ' + alert.below : ''}. Click to edit.`
                : "Set price alert";

            // Show alert chip if any alert is set
            let alertChip = "";
            if (hasAlert) {
                const parts = [];
                if (alert.above) parts.push(`<span class="alert-chip-val chip-above">↑ ${formatters.decimal(alert.above)}</span>`);
                if (alert.below) parts.push(`<span class="alert-chip-val chip-below">↓ ${formatters.decimal(alert.below)}</span>`);
                alertChip = `<div class="alert-chips">${parts.join("")}</div>`;
            }

            return `
                <div class="watchlist-row" data-sym="${sym}">
                    <div class="watchlist-row-main" onclick="openDetailModal('${sym}')">
                        <div class="watchlist-row-left">
                            <span class="watchlist-star starred" onclick="event.stopPropagation(); toggleWatchlist('${sym}', this)" title="Remove from watchlist">★</span>
                            <div class="watchlist-sym-group">
                                <span class="watchlist-row-sym">${sym}</span>
                                ${alertChip}
                            </div>
                        </div>
                        <div class="watchlist-row-right">
                            <span class="watchlist-row-price">${stock.close > 0 ? formatters.decimal(stock.close) : 'N/A'}</span>
                            <span class="watchlist-row-pct ${diffClass}">${stock.close > 0 ? caret + ' ' + formatters.percent(stock.diff_percent) : '—'}</span>
                        </div>
                    </div>
                    <button class="${alertBellClass}" 
                            onclick="event.stopPropagation(); openAlertPanel('${sym}')" 
                            title="${alertBellTitle}"
                            aria-label="Set price alert for ${sym}">
                        🔔
                    </button>
                </div>
            `;
        }).join("");
    }"""

good_block = "    // Watchlist UI removed in new dashboard layout"

if bad_block in js:
    js = js.replace(bad_block, good_block)
    with open('app.js', 'w') as f:
        f.write(js)
    print("Watchlist logic removed")
else:
    print("Could not find bad block")
