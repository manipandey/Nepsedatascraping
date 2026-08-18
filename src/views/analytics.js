/**
 * Analytics View Component: Sector Heatmap, Sector Performance Breakdown & Market Sentiment
 */

import { state } from '../state.js';
import { formatNPR, formatPercent, getTrendClass } from '../utils.js';

export function renderAnalyticsView() {
    const container = document.getElementById("view-analytics");
    if (!container) return;

    const stocks = state.stocksData || [];

    // Group stocks by sector
    const sectorMap = {};
    stocks.forEach(s => {
        const sec = s.sector || "Other";
        if (!sectorMap[sec]) {
            sectorMap[sec] = {
                sector: sec,
                count: 0,
                turnover: 0,
                volume: 0,
                gainers: 0,
                losers: 0,
                totalChangePct: 0
            };
        }
        sectorMap[sec].count++;
        sectorMap[sec].turnover += Number(s.turnover || 0);
        sectorMap[sec].volume += Number(s.volume || 0);
        const change = Number(s.diff_percent || 0);
        sectorMap[sec].totalChangePct += change;
        if (change > 0) sectorMap[sec].gainers++;
        else if (change < 0) sectorMap[sec].losers++;
    });

    const sectors = Object.values(sectorMap).map(sec => ({
        ...sec,
        avgChangePct: sec.count > 0 ? sec.totalChangePct / sec.count : 0
    })).sort((a, b) => b.turnover - a.turnover);

    container.innerHTML = `
        <div class="card glass-panel mb-4">
            <div class="card-header">
                <h3>📊 NEPSE Sector Heatmap & Performance Breakdown</h3>
            </div>
            <div class="card-body">
                <div class="sector-grid">
                    ${sectors.map(sec => {
                        const trend = getTrendClass(sec.avgChangePct);
                        return `
                            <div class="sector-card glass-card ${trend}">
                                <div class="sector-card-title">${sec.sector}</div>
                                <div class="sector-card-change font-mono">${formatPercent(sec.avgChangePct)}</div>
                                <div class="sector-card-meta">
                                    <span>${sec.count} Scrips</span> • 
                                    <span class="text-emerald">▲${sec.gainers}</span> 
                                    <span class="text-crimson">▼${sec.losers}</span>
                                </div>
                                <div class="sector-card-turnover mt-2 text-muted">
                                    Turnover: ${formatNPR(sec.turnover)}
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        </div>
    `;
}
