/**
 * Dashboard View Component: NEPSE Index Marquee, Market Overview, Top Gainers/Losers/Turnover Leaders
 */

import { state } from '../state.js';
import { formatNPR, formatNumber, formatPercent, formatCompact, getTrendClass } from '../utils.js';

export function renderDashboardView() {
    const container = document.getElementById("view-dashboard");
    if (!container) return;

    const stocks = state.stocksData || [];
    const indices = state.indicesData || [];
    
    // Calculate Market Summary Stats
    let totalTurnover = 0;
    let totalVolume = 0;
    let totalTransactions = 0;
    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;

    stocks.forEach(s => {
        const diff = Number(s.diff || 0);
        if (diff > 0) advancers++;
        else if (diff < 0) decliners++;
        else unchanged++;

        totalTurnover += Number(s.turnover || 0);
        totalVolume += Number(s.volume || 0);
        totalTransactions += Number(s.transactions || 0);
    });

    // Extract top movers
    const sortedByTurnover = [...stocks].sort((a, b) => Number(b.turnover || 0) - Number(a.turnover || 0));
    const sortedByGainers = [...stocks].sort((a, b) => Number(b.diff_percent || 0) - Number(a.diff_percent || 0));
    const sortedByLosers = [...stocks].sort((a, b) => Number(a.diff_percent || 0) - Number(b.diff_percent || 0));

    const topTurnover = sortedByTurnover.slice(0, 5);
    const topGainers = sortedByGainers.slice(0, 5);
    const topLosers = sortedByLosers.slice(0, 5);

    container.innerHTML = `
        <!-- Market Indices Marquee Bar -->
        <div class="indices-marquee-container glass-card">
            <div class="indices-marquee-track">
                ${indices.map(idx => {
                    const name = idx.title || idx.indicesName || "Index";
                    const val = Number(idx.value || idx.currentValue || 0).toFixed(2);
                    const change = Number(idx.change || idx.pointChange || 0);
                    const pct = Number(idx.change_percent || idx.perChange || 0);
                    const trendClass = getTrendClass(change);
                    return `
                        <div class="index-chip ${trendClass}">
                            <span class="index-name">${name}</span>
                            <span class="index-val">${val}</span>
                            <span class="index-change">${formatPercent(pct)}</span>
                        </div>
                    `;
                }).join("")}
            </div>
        </div>

        <!-- Key Market Summary Cards -->
        <div class="dashboard-grid">
            <div class="stat-card glass-panel border-accent">
                <div class="stat-title">Total Turnover</div>
                <div class="stat-value text-emerald">${formatNPR(totalTurnover)}</div>
                <div class="stat-sub">Traded across ${stocks.length} companies</div>
            </div>
            <div class="stat-card glass-panel">
                <div class="stat-title">Total Volume</div>
                <div class="stat-value">${formatCompact(totalVolume)} Shares</div>
                <div class="stat-sub">${formatNumber(totalTransactions)} Transactions</div>
            </div>
            <div class="stat-card glass-panel">
                <div class="stat-title">Market Breadth</div>
                <div class="breadth-bar">
                    <span class="breadth-segment bg-emerald" style="flex: ${advancers || 1};" title="${advancers} Advancers"></span>
                    <span class="breadth-segment bg-gray" style="flex: ${unchanged || 1};" title="${unchanged} Unchanged"></span>
                    <span class="breadth-segment bg-crimson" style="flex: ${decliners || 1};" title="${decliners} Decliners"></span>
                </div>
                <div class="breadth-labels">
                    <span class="text-emerald">▲ ${advancers} Advancers</span>
                    <span class="text-gray">■ ${unchanged} Neutral</span>
                    <span class="text-crimson">▼ ${decliners} Decliners</span>
                </div>
            </div>
        </div>

        <!-- Leaderboards Grid -->
        <div class="leaderboards-grid">
            <!-- Turnover Leaders -->
            <div class="card glass-panel">
                <div class="card-header">
                    <h3>🔥 Top Turnover Leaders</h3>
                </div>
                <div class="card-body p-0">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th class="text-right">LTP</th>
                                <th class="text-right">Turnover</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topTurnover.map(s => `
                                <tr class="clickable-row" data-symbol="${s.symbol}">
                                    <td><strong class="symbol-badge">${s.symbol}</strong></td>
                                    <td class="text-right">${formatNPR(s.ltp)}</td>
                                    <td class="text-right font-mono text-emerald">${formatNPR(s.turnover)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Top Gainers -->
            <div class="card glass-panel">
                <div class="card-header">
                    <h3>🚀 Top Gainers</h3>
                </div>
                <div class="card-body p-0">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th class="text-right">LTP</th>
                                <th class="text-right">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topGainers.map(s => `
                                <tr class="clickable-row" data-symbol="${s.symbol}">
                                    <td><strong class="symbol-badge">${s.symbol}</strong></td>
                                    <td class="text-right">${formatNPR(s.ltp)}</td>
                                    <td class="text-right font-mono text-emerald">+${Number(s.diff_percent || 0).toFixed(2)}%</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Top Decliners -->
            <div class="card glass-panel">
                <div class="card-header">
                    <h3>📉 Top Decliners</h3>
                </div>
                <div class="card-body p-0">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th class="text-right">LTP</th>
                                <th class="text-right">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topLosers.map(s => `
                                <tr class="clickable-row" data-symbol="${s.symbol}">
                                    <td><strong class="symbol-badge">${s.symbol}</strong></td>
                                    <td class="text-right">${formatNPR(s.ltp)}</td>
                                    <td class="text-right font-mono text-crimson">${Number(s.diff_percent || 0).toFixed(2)}%</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Add click event listeners to table rows for opening stock details modal
    container.querySelectorAll(".clickable-row").forEach(row => {
        row.addEventListener("click", () => {
            const sym = row.getAttribute("data-symbol");
            if (sym && window.openStockDetailModal) {
                window.openStockDetailModal(sym);
            }
        });
    });
}
