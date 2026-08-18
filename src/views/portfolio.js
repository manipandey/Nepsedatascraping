/**
 * Portfolio & Trade Journal View Component: Investment Holdings, Unrealized P&L, Cloud Sync
 */

import { state } from '../state.js';
import { formatNPR, formatNumber, formatPercent, getTrendClass } from '../utils.js';
import { saveUserPortfolio } from '../auth.js';

export function renderPortfolioView() {
    const container = document.getElementById("view-portfolio");
    if (!container) return;

    const holdings = state.portfolioHoldings || [];
    const stockMap = {};
    (state.stocksData || []).forEach(s => { stockMap[s.symbol] = s; });

    let totalInvestment = 0;
    let totalCurrentValue = 0;

    const enrichedHoldings = holdings.map((item, index) => {
        const live = stockMap[item.symbol] || {};
        const ltp = Number(live.ltp || live.close || item.buyPrice || 0);
        const qty = Number(item.units || 0);
        const buyPrice = Number(item.buyPrice || 0);

        const investment = qty * buyPrice;
        const currentValue = qty * ltp;
        const pnl = currentValue - investment;
        const pnlPct = investment > 0 ? (pnl / investment) * 100 : 0;

        totalInvestment += investment;
        totalCurrentValue += currentValue;

        return {
            ...item,
            index,
            ltp,
            investment,
            currentValue,
            pnl,
            pnlPct
        };
    });

    const totalPnL = totalCurrentValue - totalInvestment;
    const totalPnLPct = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
    const overallTrendClass = getTrendClass(totalPnL);

    container.innerHTML = `
        <!-- Portfolio Overview Summary Cards -->
        <div class="dashboard-grid mb-4">
            <div class="stat-card glass-panel">
                <div class="stat-title">Total Investment</div>
                <div class="stat-value">${formatNPR(totalInvestment)}</div>
                <div class="stat-sub">${holdings.length} Scrips in Portfolio</div>
            </div>
            <div class="stat-card glass-panel">
                <div class="stat-title">Current Portfolio Value</div>
                <div class="stat-value font-mono">${formatNPR(totalCurrentValue)}</div>
            </div>
            <div class="stat-card glass-panel border-accent">
                <div class="stat-title">Unrealized Gain / Loss</div>
                <div class="stat-value ${overallTrendClass}">${formatNPR(totalPnL)}</div>
                <div class="stat-sub ${overallTrendClass}">${formatPercent(totalPnLPct)} Total Return</div>
            </div>
        </div>

        <!-- Add Holding Controls -->
        <div class="card glass-panel mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h3>💼 Add Stock Holding</h3>
            </div>
            <div class="card-body">
                <form id="addHoldingForm" class="row g-3 align-items-end">
                    <div class="col-md-3">
                        <label class="form-label">Symbol</label>
                        <input type="text" id="holdingSymbol" class="form-input text-uppercase" placeholder="e.g. NTC, NABIL" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Units (Quantity)</label>
                        <input type="number" id="holdingUnits" class="form-input" placeholder="e.g. 100" min="1" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Buy Price (NPR)</label>
                        <input type="number" id="holdingBuyPrice" class="form-input" placeholder="e.g. 500" step="0.01" min="0.01" required>
                    </div>
                    <div class="col-md-3">
                        <button type="submit" class="btn btn-primary w-100">+ Add Position</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Holdings Table -->
        <div class="card glass-panel">
            <div class="card-header">
                <h3>Holdings Breakdown</h3>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table align-middle">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th class="text-right">Units</th>
                                <th class="text-right">Avg Buy Price</th>
                                <th class="text-right">Current LTP</th>
                                <th class="text-right">Investment</th>
                                <th class="text-right">Current Value</th>
                                <th class="text-right">P&L (NPR)</th>
                                <th class="text-right">Return (%)</th>
                                <th class="text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${enrichedHoldings.length === 0 ? `
                                <tr>
                                    <td colspan="9" class="text-center py-4 text-muted">
                                        No stock holdings added yet. Use the form above to add your positions.
                                    </td>
                                </tr>
                            ` : enrichedHoldings.map(h => {
                                const trend = getTrendClass(h.pnl);
                                return `
                                    <tr>
                                        <td><strong class="symbol-badge">${h.symbol}</strong></td>
                                        <td class="text-right font-mono">${formatNumber(h.units)}</td>
                                        <td class="text-right">${formatNPR(h.buyPrice)}</td>
                                        <td class="text-right font-weight-bold">${formatNPR(h.ltp)}</td>
                                        <td class="text-right">${formatNPR(h.investment)}</td>
                                        <td class="text-right font-mono">${formatNPR(h.currentValue)}</td>
                                        <td class="text-right font-mono ${trend}">${formatNPR(h.pnl)}</td>
                                        <td class="text-right font-mono ${trend}">${formatPercent(h.pnlPct)}</td>
                                        <td class="text-center">
                                            <button class="btn btn-sm btn-danger delete-holding-btn" data-index="${h.index}" title="Remove Holding">&times;</button>
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

    // Form submit listener
    const form = container.querySelector("#addHoldingForm");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const symbol = container.querySelector("#holdingSymbol").value.toUpperCase().trim();
            const units = parseFloat(container.querySelector("#holdingUnits").value);
            const buyPrice = parseFloat(container.querySelector("#holdingBuyPrice").value);

            if (symbol && units > 0 && buyPrice > 0) {
                const currentHoldings = state.portfolioHoldings || [];
                currentHoldings.push({ symbol, units, buyPrice, added_at: new Date().toISOString() });
                saveUserPortfolio(currentHoldings);
                renderPortfolioView();
            }
        });
    }

    // Delete holding listener
    container.querySelectorAll(".delete-holding-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.getAttribute("data-index"), 10);
            if (!isNaN(idx)) {
                const currentHoldings = state.portfolioHoldings || [];
                currentHoldings.splice(idx, 1);
                saveUserPortfolio(currentHoldings);
                renderPortfolioView();
            }
        });
    });
}
