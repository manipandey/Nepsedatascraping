/**
 * Watchlist & Price Alerts View Component
 */

import { state } from '../state.js';
import { formatNPR, formatPercent, getTrendClass } from '../utils.js';
import { saveUserWatchlist } from '../auth.js';

export function renderWatchlistView() {
    const container = document.getElementById("view-watchlist");
    if (!container) return;

    const watchlistSymbols = state.customWatchlist || [];
    const stockMap = {};
    (state.stocksData || []).forEach(s => { stockMap[s.symbol] = s; });

    const watchlistedStocks = watchlistSymbols.map(sym => stockMap[sym] || { symbol: sym, ltp: 0, diff_percent: 0 });

    container.innerHTML = `
        <div class="card glass-panel mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h3>⭐ Favorite Watchlist Scrips (${watchlistSymbols.length})</h3>
            </div>
            <div class="card-body">
                <div class="d-flex gap-2">
                    <input type="text" id="addWatchlistInput" class="form-input text-uppercase" placeholder="Enter stock symbol (e.g. CIT, SHIVM)...">
                    <button id="addWatchlistBtn" class="btn btn-primary">+ Add to Watchlist</button>
                </div>
            </div>
        </div>

        <div class="card glass-panel">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table align-middle">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Sector</th>
                                <th class="text-right">LTP (NPR)</th>
                                <th class="text-right">Daily Change</th>
                                <th class="text-right">52W High</th>
                                <th class="text-right">52W Low</th>
                                <th class="text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${watchlistedStocks.length === 0 ? `
                                <tr>
                                    <td colspan="7" class="text-center py-4 text-muted">
                                        Your watchlist is empty. Add scrips above or click the star (★) on any stock table row.
                                    </td>
                                </tr>
                            ` : watchlistedStocks.map(s => {
                                const trend = getTrendClass(s.diff_percent);
                                return `
                                    <tr class="clickable-row" data-symbol="${s.symbol}">
                                        <td><strong class="symbol-badge">${s.symbol}</strong></td>
                                        <td><span class="text-muted">${s.sector || 'N/A'}</span></td>
                                        <td class="text-right font-weight-bold">${formatNPR(s.ltp)}</td>
                                        <td class="text-right font-mono ${trend}">${formatPercent(s.diff_percent)}</td>
                                        <td class="text-right text-emerald">${formatNPR(s.fifty_two_week_high)}</td>
                                        <td class="text-right text-crimson">${formatNPR(s.fifty_two_week_low)}</td>
                                        <td class="text-center">
                                            <button class="btn btn-sm btn-outline-danger remove-watch-btn" data-symbol="${s.symbol}">Remove</button>
                                        </td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Add watchlist button listener
    const addBtn = container.querySelector("#addWatchlistBtn");
    const addInput = container.querySelector("#addWatchlistInput");

    const handleAdd = () => {
        const sym = addInput.value.toUpperCase().trim();
        if (sym && !watchlistSymbols.includes(sym)) {
            watchlistSymbols.push(sym);
            saveUserWatchlist(watchlistSymbols);
            renderWatchlistView();
        }
    };

    if (addBtn) addBtn.addEventListener("click", handleAdd);
    if (addInput) {
        addInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleAdd();
        });
    }

    // Remove buttons listener
    container.querySelectorAll(".remove-watch-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const sym = btn.getAttribute("data-symbol");
            if (sym) {
                const updated = watchlistSymbols.filter(s => s !== sym);
                saveUserWatchlist(updated);
                renderWatchlistView();
            }
        });
    });

    // Row click to detail modal
    container.querySelectorAll(".clickable-row").forEach(row => {
        row.addEventListener("click", (e) => {
            if (e.target.classList.contains("remove-watch-btn")) return;
            const sym = row.getAttribute("data-symbol");
            if (sym && window.openStockDetailModal) {
                window.openStockDetailModal(sym);
            }
        });
    });
}
