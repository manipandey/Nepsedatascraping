/* ====================================================================
   NEPSE TERMINAL - MOBILE APP CONTROLLER (mobile.js)
   ==================================================================== */

import { state } from './src/state.js';
import { formatNPR, formatNumber } from './src/utils.js';
import {
    fetchData as apiFetchData,
    fetchBankRates as apiFetchBankRates,
    fetchNrbIndicators as apiFetchNrbIndicators
} from './src/api.js';

let activeMobileTab = "portfolio";
let mobileSearchQuery = "";
let mobileSelectedSector = "all";
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById("mInstallAppBtn");
    if (btn) btn.style.display = "inline-flex";
});

window.triggerMobileAppInstall = async function() {
    if (!deferredPrompt) return alert("To install NEPSE App on your phone: Tap your browser menu (⋮ or Share) and select 'Add to Home Screen'!");
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        const btn = document.getElementById("mInstallAppBtn");
        if (btn) btn.style.display = "none";
    }
    deferredPrompt = null;
};

// Initialize Mobile Web App
document.addEventListener("DOMContentLoaded", async () => {
    try {
        await apiFetchData();
        enrichMobileTechnicalIndicators(state.stocksData);
    } catch (e) {
        console.warn("Mobile initial fetch warning:", e);
    }

    renderMobileActiveTab();
    setupMobileCalculators();
});

// Switch Mobile Bottom Nav Tab
window.switchMobileTab = function(tabName) {
    activeMobileTab = tabName;

    // Update bottom nav UI
    document.querySelectorAll(".mobile-bottom-nav .nav-tab").forEach(tab => {
        if (tab.getAttribute("data-tab") === tabName) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    // Update view container UI
    document.querySelectorAll(".mobile-view").forEach(v => v.classList.remove("active"));
    const targetView = document.getElementById(`mobile${capitalize(tabName)}View`);
    if (targetView) targetView.classList.add("active");

    renderMobileActiveTab();
};

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderMobileActiveTab() {
    if (activeMobileTab === "portfolio") {
        renderMobilePortfolio();
    } else if (activeMobileTab === "liveData") {
        renderMobileLiveData();
    } else if (activeMobileTab === "heatmap") {
        renderMobileHeatmap();
    } else if (activeMobileTab === "calculators") {
        calculateMobileRiskSize();
        calculateMobileMarginLoan();
    } else if (activeMobileTab === "rates") {
        renderMobileRates();
    } else if (activeMobileTab === "watchlist") {
        renderMobileWatchlist();
    }
}

// -------------------------------------------------------------
// 1. Mobile Portfolio Tracker
// -------------------------------------------------------------
function renderMobilePortfolio() {
    const holdings = state.portfolioHoldings || [];
    const listEl = document.getElementById("mHoldingsList");
    const countEl = document.getElementById("mHoldingsCount");

    if (countEl) countEl.textContent = holdings.length;

    let totalInvested = 0;
    let totalCurrent = 0;

    if (!holdings.length) {
        if (listEl) {
            listEl.innerHTML = `
                <div class="mobile-card text-center" style="color: var(--mobile-text-sub); padding: 24px;">
                    No portfolio holdings logged yet.<br>Tap <strong>"Add Position"</strong> to start tracking!
                </div>
            `;
        }
    } else {
        if (listEl) {
            listEl.innerHTML = holdings.map(h => {
                const stock = (state.stocksData || []).find(s => s.symbol === h.symbol);
                const ltp = stock ? stock.ltp : h.buyPrice;
                const invested = h.shares * h.buyPrice;
                const current = h.shares * ltp;
                const pl = current - invested;
                const plPct = invested > 0 ? (pl / invested) * 100 : 0;
                const isUp = pl >= 0;

                totalInvested += invested;
                totalCurrent += current;

                const visualBar = renderMobileTPSLBar(h.buyPrice, h.tp, h.sl, ltp);

                return `
                    <div class="mobile-card" style="border-left: 4px solid ${isUp ? '#10b981' : '#ef4444'};">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                            <div>
                                <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1.05rem; color: #fff;">${h.symbol}</span>
                                <span style="font-size: 0.72rem; color: var(--mobile-text-sub); margin-left: 6px;">${h.shares} Shares</span>
                            </div>
                            <span class="mobile-badge ${isUp ? 'up' : 'down'}">
                                ${isUp ? '📈 +' : '📉 '}${formatNPR(pl)} (${isUp ? '+' : ''}${plPct.toFixed(2)}%)
                            </span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--mobile-text-sub); margin-bottom: 8px;">
                            <span>Entry: <strong>NPR ${h.buyPrice.toFixed(2)}</strong></span>
                            <span>LTP: <strong style="color: #fff;">NPR ${ltp.toFixed(2)}</strong></span>
                        </div>
                        ${visualBar}
                    </div>
                `;
            }).join("");
        }
    }

    const totalPL = totalCurrent - totalInvested;
    const totalPLPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
    const isUpTotal = totalPL >= 0;

    const totalValEl = document.getElementById("mPortTotalVal");
    const investedEl = document.getElementById("mPortInvested");
    const plEl = document.getElementById("mPortTotalPL");

    if (totalValEl) totalValEl.textContent = formatNPR(totalCurrent);
    if (investedEl) investedEl.textContent = formatNPR(totalInvested);
    if (plEl) {
        plEl.className = `mobile-badge ${isUpTotal ? 'up' : 'down'}`;
        plEl.textContent = `${isUpTotal ? '📈 +' : '📉 '}${formatNPR(totalPL)} (${isUpTotal ? '+' : ''}${totalPLPct.toFixed(2)}%)`;
    }
}

function renderMobileTPSLBar(entry, tp, sl, ltp) {
    const effectiveTP = tp || (entry * 1.15);
    const effectiveSL = sl || (entry * 0.93);
    const minBound = Math.min(effectiveSL, entry, ltp) * 0.98;
    const maxBound = Math.max(effectiveTP, entry, ltp) * 1.02;
    const range = maxBound - minBound || 1;

    const entryPct = Math.min(Math.max(((entry - minBound) / range) * 100, 2), 98);
    const slPct = Math.min(Math.max(((effectiveSL - minBound) / range) * 100, 2), 98);
    const tpPct = Math.min(Math.max(((effectiveTP - minBound) / range) * 100, 2), 98);
    const ltpPct = Math.min(Math.max(((ltp - minBound) / range) * 100, 2), 98);

    const isProfit = ltp >= entry;

    return `
        <div class="tp-sl-visual-container">
            <div class="tp-sl-bar-track">
                <div class="tp-sl-zone-sl" style="width: ${entryPct}%"></div>
                <div class="tp-sl-zone-tp" style="left: ${entryPct}%; width: ${100 - entryPct}%"></div>
                <div class="tp-sl-marker sl" style="left: ${slPct}%"></div>
                <div class="tp-sl-marker entry" style="left: ${entryPct}%"></div>
                <div class="tp-sl-marker tp" style="left: ${tpPct}%"></div>
                <div class="tp-sl-dot ${isProfit ? 'profit' : 'loss'}" style="left: ${ltpPct}%"></div>
            </div>
            <div class="tp-sl-labels">
                <span style="color:#f87171;">SL ${effectiveSL.toFixed(0)}</span>
                <span style="color:${isProfit ? '#34d399' : '#f87171'}; font-weight:700;">${isProfit ? '+' : ''}${(((ltp - entry) / entry) * 100).toFixed(1)}%</span>
                <span style="color:#34d399;">TP ${effectiveTP.toFixed(0)}</span>
            </div>
        </div>
    `;
}

// -------------------------------------------------------------
// 2. Mobile Live Data
// -------------------------------------------------------------
function renderMobileLiveData() {
    const stocks = state.stocksData || [];
    const indices = state.indicesData || [];

    // Indices Scroll
    const indicesEl = document.getElementById("mIndicesScroll");
    if (indicesEl && indices.length) {
        indicesEl.innerHTML = indices.map(idx => {
            const val = idx.value || idx.currentPrice || 0;
            const pct = idx.percentageChange || idx.change_percent || 0;
            const isUp = pct >= 0;
            return `
                <div class="mobile-index-chip">
                    <span class="mobile-index-chip-name">${idx.indicesName || idx.name}</span>
                    <span class="mobile-index-chip-val">${Number(val).toLocaleString()}</span>
                    <span class="mobile-badge ${isUp ? 'up' : 'down'}">${isUp ? '▲ +' : '▼ '}${Math.abs(pct).toFixed(2)}%</span>
                </div>
            `;
        }).join("");
    }

    // Populate sector select if empty
    const sectorSel = document.getElementById("mLiveSectorSelect");
    if (sectorSel && sectorSel.children.length <= 1 && stocks.length) {
        const sectors = Array.from(new Set(stocks.map(s => inferNepseSector(s.symbol, s.sector)))).sort();
        sectorSel.innerHTML = `<option value="all">All Sectors</option>` + sectors.map(sec => `<option value="${sec}">${sec}</option>`).join("");
    }

    // Filter stocks
    let filtered = [...stocks];
    if (mobileSearchQuery) {
        const q = mobileSearchQuery.toLowerCase();
        filtered = filtered.filter(s => s.symbol.toLowerCase().includes(q) || (s.sector && s.sector.toLowerCase().includes(q)));
    }
    if (mobileSelectedSector !== "all") {
        filtered = filtered.filter(s => inferNepseSector(s.symbol, s.sector).toLowerCase() === mobileSelectedSector.toLowerCase());
    }

    const countEl = document.getElementById("mLiveCount");
    if (countEl) countEl.textContent = filtered.length;

    const listEl = document.getElementById("mLiveStockList");
    if (listEl) {
        listEl.innerHTML = filtered.slice(0, 50).map(s => {
            const isUp = (s.diff || s.diff_percent || 0) >= 0;
            const sec = inferNepseSector(s.symbol, s.sector);
            return `
                <div class="mobile-card" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: #fff;">${s.symbol}</span>
                            <span style="font-size: 0.72rem; color: var(--mobile-text-sub);">${sec}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--mobile-text-sub); margin-top: 2px;">
                            Vol: ${formatNumber(s.volume)} | Turn: ${formatNPR(s.turnover)}
                        </div>
                    </div>
                    <div class="text-right">
                        <div style="font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem; color: #fff;">NPR ${(s.ltp || 0).toFixed(2)}</div>
                        <span class="mobile-badge ${isUp ? 'up' : 'down'}">
                            ${isUp ? '▲ +' : '▼ '}${Math.abs(s.diff_percent || 0).toFixed(2)}%
                        </span>
                    </div>
                </div>
            `;
        }).join("");
    }
}

window.onMobileSearchInput = function(val) {
    mobileSearchQuery = val.trim();
    renderMobileLiveData();
};

window.onMobileSectorSelect = function(val) {
    mobileSelectedSector = val;
    renderMobileLiveData();
};

// -------------------------------------------------------------
// 3. Mobile Heat Map
// -------------------------------------------------------------
function renderMobileHeatmap() {
    const stocks = state.stocksData || [];
    const gridEl = document.getElementById("mHeatmapGrid");
    if (!gridEl || !stocks.length) return;

    gridEl.innerHTML = stocks.slice(0, 48).map(s => {
        const pct = s.diff_percent || 0;
        const isUp = pct >= 0;
        const bg = isUp
            ? `rgba(16, 185, 129, ${Math.min(0.85, 0.25 + Math.abs(pct) * 0.1)})`
            : `rgba(239, 68, 68, ${Math.min(0.85, 0.25 + Math.abs(pct) * 0.1)})`;

        return `
            <div style="background: ${bg}; padding: 10px 6px; border-radius: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                <div style="font-family: var(--font-mono); font-weight: 800; font-size: 0.85rem; color: #fff;">${s.symbol}</div>
                <div style="font-size: 0.72rem; font-weight: 700; color: #fff;">${isUp ? '+' : ''}${pct.toFixed(1)}%</div>
            </div>
        `;
    }).join("");
}

// -------------------------------------------------------------
// 4. Mobile Calculators (Position Risk & Share Margin Loan)
// -------------------------------------------------------------
function setupMobileCalculators() {
    calculateMobileRiskSize();
    calculateMobileMarginLoan();
}

window.switchMobileCalcSubtab = function(tab) {
    const rBtn = document.getElementById("mTabRiskCalcBtn");
    const mBtn = document.getElementById("mTabMarginCalcBtn");
    const rSec = document.getElementById("mCalcRiskSubtab");
    const mSec = document.getElementById("mCalcMarginSubtab");

    if (tab === "risk") {
        rBtn.style.background = "var(--mobile-accent)";
        rBtn.style.color = "#fff";
        mBtn.style.background = "transparent";
        mBtn.style.color = "var(--mobile-text-sub)";
        rSec.style.display = "block";
        mSec.style.display = "none";
    } else {
        mBtn.style.background = "var(--mobile-accent)";
        mBtn.style.color = "#fff";
        rBtn.style.background = "transparent";
        rBtn.style.color = "var(--mobile-text-sub)";
        mSec.style.display = "block";
        rSec.style.display = "none";
    }
};

window.calculateMobileRiskSize = function() {
    const capital = parseFloat(document.getElementById("mRiskCapital")?.value || 500000);
    const riskPct = parseFloat(document.getElementById("mRiskPct")?.value || 2.0);
    const entry = parseFloat(document.getElementById("mRiskEntry")?.value || 450);
    const sl = parseFloat(document.getElementById("mRiskSL")?.value || 420);
    const tp = parseFloat(document.getElementById("mRiskTP")?.value || 520);

    const maxRiskAmt = capital * (riskPct / 100);
    const riskPerShare = Math.max(0.1, entry - sl);
    const shares = Math.floor(maxRiskAmt / riskPerShare);
    const totalPositionVal = shares * entry;
    const rewardPerShare = Math.max(0.1, tp - entry);
    const rrRatio = (rewardPerShare / riskPerShare).toFixed(2);

    const sharesEl = document.getElementById("mRiskSharesVal");
    const posValEl = document.getElementById("mRiskTotalVal");
    const riskAmtEl = document.getElementById("mRiskAmtVal");
    const rrEl = document.getElementById("mRiskRRVal");

    if (sharesEl) sharesEl.textContent = `${shares.toLocaleString()} Shares`;
    if (posValEl) posValEl.textContent = formatNPR(totalPositionVal);
    if (riskAmtEl) riskAmtEl.textContent = formatNPR(maxRiskAmt);
    if (rrEl) rrEl.textContent = `Risk:Reward Ratio 1:${rrRatio}`;
};

window.calculateMobileMarginLoan = function() {
    const collateral = parseFloat(document.getElementById("mMarginCollateral")?.value || 1000000);
    const ltvPct = parseFloat(document.getElementById("mMarginLTV")?.value || 70);
    const ratePct = parseFloat(document.getElementById("mMarginRate")?.value || 10.5);

    const maxLoan = collateral * (ltvPct / 100);
    const annualInterest = maxLoan * (ratePct / 100);
    const marginCallDropPct = ((1 - (ltvPct / 100) / 0.85) * 100).toFixed(1);

    const loanEl = document.getElementById("mMarginLoanVal");
    const interestEl = document.getElementById("mMarginInterestVal");
    const callEl = document.getElementById("mMarginCallVal");

    if (loanEl) loanEl.textContent = formatNPR(maxLoan);
    if (interestEl) interestEl.textContent = formatNPR(annualInterest);
    if (callEl) callEl.textContent = `-${marginCallDropPct}% collateral drop`;
};

// -------------------------------------------------------------
// 5. Mobile Bank Rates & NRB Indicators
// -------------------------------------------------------------
async function renderMobileRates() {
    try {
        const nrb = await apiFetchNrbIndicators();
        if (nrb && nrb.indicators) {
            const gridEl = document.getElementById("mNrbGrid");
            if (gridEl) {
                gridEl.innerHTML = nrb.indicators.map(ind => `
                    <div class="mobile-card">
                        <div style="font-size:0.72rem; color:var(--mobile-text-sub);">${ind.name}</div>
                        <div style="font-family:var(--font-mono); font-size:1.15rem; font-weight:800; color:#34d399;">${ind.value} ${ind.unit || ''}</div>
                    </div>
                `).join("");
            }
        }
    } catch (e) {}

    try {
        const rates = await apiFetchBankRates();
        const listEl = document.getElementById("mBankRatesList");
        if (listEl && rates.fixed_deposits) {
            listEl.innerHTML = rates.fixed_deposits.slice(0, 10).map(fd => `
                <div class="mobile-card" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 700; color: #fff;">${fd.companyName || 'Bank'}</div>
                        <div style="font-size: 0.72rem; color: var(--mobile-text-sub);">${fd.term || '1 Year'}</div>
                    </div>
                    <div style="font-family: var(--font-mono); font-size: 1.1rem; font-weight: 800; color: #34d399;">
                        ${(fd.interestRate * 100).toFixed(2)}%
                    </div>
                </div>
            `).join("");
        }
    } catch (e) {}
}

// -------------------------------------------------------------
// 6. Mobile Watchlist & Price Alerts
// -------------------------------------------------------------
function renderMobileWatchlist() {
    const list = state.customWatchlist || ["ADBL", "SHIVM", "CHCL"];
    const listEl = document.getElementById("mWatchlistList");

    if (listEl) {
        listEl.innerHTML = list.map(sym => {
            const s = (state.stocksData || []).find(st => st.symbol === sym);
            const ltp = s ? s.ltp : 350;
            const pct = s ? (s.diff_percent || 0) : 0.5;
            const isUp = pct >= 0;

            return `
                <div class="mobile-card" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.05rem; color: #fff;">${sym}</div>
                        <div style="font-size: 0.72rem; color: var(--mobile-text-sub);">Alert Target: <strong>NPR ${(ltp * 1.1).toFixed(0)}</strong></div>
                    </div>
                    <div class="text-right">
                        <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: #fff;">NPR ${ltp.toFixed(2)}</div>
                        <span class="mobile-badge ${isUp ? 'up' : 'down'}">${isUp ? '▲ +' : '▼ '}${Math.abs(pct).toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }).join("");
    }
}

// Modals Helper
window.openMobileAddHoldingModal = function() {
    document.getElementById("mAddHoldingModal")?.classList.add("active");
};

window.closeMobileModal = function(id) {
    document.getElementById(id)?.classList.remove("active");
};

window.saveMobileHolding = function() {
    const sym = document.getElementById("mAddSymbol")?.value.trim().toUpperCase();
    const shares = parseFloat(document.getElementById("mAddShares")?.value || 100);
    const buyPrice = parseFloat(document.getElementById("mAddBuyPrice")?.value || 300);
    const tp = parseFloat(document.getElementById("mAddTP")?.value || 0);
    const sl = parseFloat(document.getElementById("mAddSL")?.value || 0);

    if (!sym) return alert("Please enter stock symbol!");

    if (!state.portfolioHoldings) state.portfolioHoldings = [];
    state.portfolioHoldings.push({
        id: Date.now(),
        symbol: sym,
        shares,
        buyPrice,
        tp,
        sl
    });

    closeMobileModal("mAddHoldingModal");
    renderMobilePortfolio();
};

function inferNepseSector(symbol, providedSector) {
    if (providedSector && providedSector.length > 2) return providedSector;
    const sym = (symbol || "").toUpperCase();
    if (sym.endsWith("LB") || sym.includes("MICRO")) return "Microfinance";
    if (["ADBL", "NICA", "NABIL", "GBIME", "EBL", "SANIMA", "SCB"].includes(sym)) return "Commercial Banks";
    if (sym.endsWith("DBL")) return "Development Banks";
    if (sym.endsWith("FL")) return "Finance";
    return "HydroPower";
}

function enrichMobileTechnicalIndicators(stocks) {
    if (!Array.isArray(stocks)) return;
    stocks.forEach(s => {
        const sma20 = s.sma20 || s.dma20 || s.ltp || 100;
        if (!s.sma50) s.sma50 = Number((sma20 * 0.97).toFixed(2));
        if (s.rsi14 === undefined) s.rsi14 = 52.4;
    });
}
