/**
 * Stock Detail Modal Component: Fundamentals, Shareholding Structure & Lock-in Expiry Tracker
 */

import { state } from '../state.js';
import { formatNPR, formatNumber, formatPercent, getTrendClass } from '../utils.js';

export function openStockDetailModal(symbol) {
    const modal = document.getElementById("modal-stock-detail");
    if (!modal) return;

    const stock = (state.stocksData || []).find(s => s.symbol === symbol) || { symbol };
    const fundamentals = (state.fundamentalData || []).find(f => f.symbol === symbol) || {};
    const shareStructure = (state.shareStructureData || []).find(s => s.symbol === symbol) || {};

    const trendClass = getTrendClass(stock.diff_percent);

    modal.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
            <div>
                <h2 class="modal-title">${stock.symbol} <span class="badge bg-secondary">${stock.sector || 'NEPSE'}</span></h2>
                <div class="text-muted">${stock.fullName || stock.symbol}</div>
            </div>
            <button class="btn-close" id="closeStockModalBtn">&times;</button>
        </div>
        <div class="modal-body">
            <!-- Price Summary Row -->
            <div class="detail-summary-grid">
                <div class="detail-price-box">
                    <div class="detail-label">Current LTP</div>
                    <div class="detail-value font-mono">${formatNPR(stock.ltp)}</div>
                    <div class="detail-change ${trendClass}">${formatPercent(stock.diff_percent)} (${formatNPR(stock.diff)})</div>
                </div>
                <div class="detail-stat-box">
                    <div class="detail-label">Open / High / Low</div>
                    <div class="detail-value">${formatNPR(stock.open)} / <span class="text-emerald">${formatNPR(stock.high)}</span> / <span class="text-crimson">${formatNPR(stock.low)}</span></div>
                </div>
                <div class="detail-stat-box">
                    <div class="detail-label">Traded Volume</div>
                    <div class="detail-value">${formatNumber(stock.volume)} Shares</div>
                </div>
                <div class="detail-stat-box">
                    <div class="detail-label">Turnover</div>
                    <div class="detail-value text-emerald">${formatNPR(stock.turnover)}</div>
                </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="tabs-nav mt-4">
                <button class="tab-btn active" data-tab="tab-fundamentals">Key Fundamentals</button>
                <button class="tab-btn" data-tab="tab-structure">Shareholding Structure</button>
            </div>

            <!-- Tab: Fundamentals -->
            <div class="tab-content active" id="tab-fundamentals">
                <div class="grid-2-col mt-3">
                    <div class="stat-group glass-card p-3">
                        <div class="stat-row"><span>Quarter</span> <strong>${fundamentals.quarter || 'Q3 2080/81'}</strong></div>
                        <div class="stat-row"><span>Earnings Per Share (EPS)</span> <strong>${fundamentals.eps ? 'NPR ' + fundamentals.eps : 'N/A'}</strong></div>
                        <div class="stat-row"><span>Book Value Per Share</span> <strong>${fundamentals.book_value ? 'NPR ' + fundamentals.book_value : 'N/A'}</strong></div>
                        <div class="stat-row"><span>Price to Earnings (P/E)</span> <strong>${fundamentals.pe_ratio || 'N/A'}</strong></div>
                    </div>
                    <div class="stat-group glass-card p-3">
                        <div class="stat-row"><span>Price to Book (P/B)</span> <strong>${fundamentals.pb_ratio || 'N/A'}</strong></div>
                        <div class="stat-row"><span>Return on Equity (ROE)</span> <strong>${fundamentals.roe_pct ? fundamentals.roe_pct + '%' : 'N/A'}</strong></div>
                        <div class="stat-row"><span>52-Week High</span> <strong class="text-emerald">${stock.fifty_two_week_high ? 'NPR ' + stock.fifty_two_week_high : 'N/A'}</strong></div>
                        <div class="stat-row"><span>52-Week Low</span> <strong class="text-crimson">${stock.fifty_two_week_low ? 'NPR ' + stock.fifty_two_week_low : 'N/A'}</strong></div>
                    </div>
                </div>
            </div>

            <!-- Tab: Shareholding Structure -->
            <div class="tab-content" id="tab-structure">
                <div class="glass-card p-3 mt-3">
                    <h4>Official Shareholding Ratio</h4>
                    <div class="structure-bars mt-2">
                        <div class="stat-row"><span>Promoter Holding</span> <strong>${shareStructure.promoter_pct ? shareStructure.promoter_pct + '%' : '51.00%'}</strong></div>
                        <div class="stat-row"><span>Public Holding</span> <strong>${shareStructure.public_pct ? shareStructure.public_pct + '%' : '49.00%'}</strong></div>
                        <div class="stat-row"><span>Government Holding</span> <strong>${shareStructure.government_pct ? shareStructure.government_pct + '%' : '0.00%'}</strong></div>
                    </div>
                    ${shareStructure.lockin_end_date ? `
                        <div class="alert alert-warning mt-3">
                            🔒 <strong>Promoter Lock-in Expiry:</strong> ${shareStructure.lockin_end_date} (${shareStructure.lockin_status || 'Locked'})
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-outline" id="closeStockModalFooterBtn">Close</button>
        </div>
    `;

    modal.classList.add("show");

    // Close button event listeners
    const closeBtns = [modal.querySelector("#closeStockModalBtn"), modal.querySelector("#closeStockModalFooterBtn")];
    closeBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener("click", () => {
                modal.classList.remove("show");
            });
        }
    });

    // Tab switching
    modal.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            modal.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            modal.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            const targetContent = modal.querySelector(`#${targetId}`);
            if (targetContent) targetContent.classList.add("active");
        });
    });
}
