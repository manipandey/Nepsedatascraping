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

    updateMobileUserUI();

    if (localStorage.getItem("nepse_logged_in") === "true") {
        const username = localStorage.getItem("nepse_user_email");
        if (username && typeof syncFromSupabase === "function") {
            try {
                const syncRes = await syncFromSupabase(username, state.portfolioHoldings || [], []);
                if (syncRes) {
                    if (syncRes.holdings) state.portfolioHoldings = syncRes.holdings;
                    if (syncRes.watchlist) state.customWatchlist = syncRes.watchlist;
                }
            } catch(err) {
                console.warn("Mobile auto sync on load warning:", err);
            }
        }
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
                                <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1.05rem; color: var(--mobile-text);">${h.symbol}</span>
                                <span style="font-size: 0.72rem; color: var(--mobile-text-sub); margin-left: 6px;">${h.shares} Shares</span>
                            </div>
                            <span class="mobile-badge ${isUp ? 'up' : 'down'}">
                                ${isUp ? '📈 +' : '📉 '}${formatNPR(pl)} (${isUp ? '+' : ''}${plPct.toFixed(2)}%)
                            </span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--mobile-text-sub); margin-bottom: 8px;">
                            <span>Entry: <strong>NPR ${h.buyPrice.toFixed(2)}</strong></span>
                            <span>LTP: <strong style="color: var(--mobile-text);">NPR ${ltp.toFixed(2)}</strong></span>
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

    // Calculate total turnover, volume, and market breadth
    const totalTurnover = stocks.reduce((acc, s) => acc + (s.turnover || 0), 0);
    const totalVolume = stocks.reduce((acc, s) => acc + (s.volume || 0), 0);
    const adv = stocks.filter(s => (s.diff || s.diff_percent || 0) > 0).length;
    const dec = stocks.filter(s => (s.diff || s.diff_percent || 0) < 0).length;

    const elTurnover = document.getElementById("mLiveTurnover");
    if (elTurnover) elTurnover.textContent = formatNPR(totalTurnover);

    const elVolume = document.getElementById("mLiveVolume");
    if (elVolume) elVolume.textContent = `${formatNumber(totalVolume)} Shs`;

    const elBreadth = document.getElementById("mLiveBreadth");
    if (elBreadth) elBreadth.textContent = `🟢 ${adv} / 🔴 ${dec}`;

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
        listEl.innerHTML = filtered.map(s => {
            const isUp = (s.diff || s.diff_percent || 0) >= 0;
            const sec = inferNepseSector(s.symbol, s.sector);
            return `
                <div class="mobile-card" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: var(--mobile-text);">${s.symbol}</span>
                            <span style="font-size: 0.72rem; color: var(--mobile-text-sub);">${sec}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--mobile-text-sub); margin-top: 2px;">
                            Vol: ${formatNumber(s.volume)} | Turn: ${formatNPR(s.turnover)}
                        </div>
                    </div>
                    <div class="text-right">
                        <div style="font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem; color: var(--mobile-text);">NPR ${(s.ltp || 0).toFixed(2)}</div>
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

let mobileHeatFilter = "all";
let mobileHeatmapViewMode = "bubble";

window.setMobileHeatmapMode = function(mode) {
    mobileHeatmapViewMode = mode;
    const bubbleBtn = document.getElementById("mHeatModeBubbleBtn");
    const treemapBtn = document.getElementById("mHeatModeTreemapBtn");
    if (bubbleBtn && treemapBtn) {
        if (mode === "bubble") {
            bubbleBtn.style.background = "var(--mobile-accent)";
            bubbleBtn.style.color = "#ffffff";
            bubbleBtn.style.fontWeight = "700";
            treemapBtn.style.background = "transparent";
            treemapBtn.style.color = "var(--mobile-text-sub)";
            treemapBtn.style.fontWeight = "normal";
        } else {
            treemapBtn.style.background = "var(--mobile-accent)";
            treemapBtn.style.color = "#ffffff";
            treemapBtn.style.fontWeight = "700";
            bubbleBtn.style.background = "transparent";
            bubbleBtn.style.color = "var(--mobile-text-sub)";
            bubbleBtn.style.fontWeight = "normal";
        }
    }
    renderMobileHeatmap();
};

window.setMobileHeatFilter = function(filterName, btnEl) {
    mobileHeatFilter = filterName;
    document.querySelectorAll(".m-heat-tab").forEach(b => b.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderMobileHeatmap();
};

function renderMobileHeatmap() {
    const stocks = state.stocksData || [];
    const container = document.getElementById("mHeatmapContainer");
    if (!container || !stocks.length) return;

    // Populate sector dropdown if empty
    const sectorSel = document.getElementById("mHeatSectorSelect");
    if (sectorSel && sectorSel.children.length <= 1) {
        const sectors = Array.from(new Set(stocks.map(s => inferNepseSector(s.symbol, s.sector)))).sort();
        sectorSel.innerHTML = `<option value="all">🌐 All Sectors</option>` + sectors.map(sec => `<option value="${sec}">${sec}</option>`).join("");
    }

    const selectedSec = sectorSel ? sectorSel.value : "all";
    const sizeMode = (document.getElementById("mHeatSizeMode")?.value) || "turnover";

    let items = stocks.map(s => {
        const turnoverVal = s.turnover || ((s.ltp || 100) * (s.volume || 1000)) || 10000;
        const volumeVal = s.volume || 100;
        return {
            symbol: s.symbol,
            fullName: s.fullName || s.symbol,
            sector: inferNepseSector(s.symbol, s.sector),
            ltp: s.ltp || 0,
            diff: s.diff || 0,
            diffPct: s.diff_percent || 0,
            volume: volumeVal,
            turnover: turnoverVal,
            sizeVal: sizeMode === "volume" ? volumeVal : turnoverVal
        };
    });

    if (selectedSec !== "all") {
        items = items.filter(i => i.sector && i.sector.toLowerCase() === selectedSec.toLowerCase());
    }

    if (!items.length) {
        container.innerHTML = `<div style="text-align: center; color: var(--mobile-text-sub); padding: 30px;">No stocks found for selected filter.</div>`;
        return;
    }

    // Sort and take top 55 for crisp mobile performance
    items.sort((a, b) => b.sizeVal - a.sizeVal);
    items = items.slice(0, 55);

    const width = container.clientWidth || 360;
    const height = 430;

    container.innerHTML = "";

    const getTileColor = (pct) => {
        if (pct >= 5.0) return "#059669";      // Circuit / Strong Gain (+5%+)
        if (pct >= 3.0) return "#10b981";      // Bright Green (+3% to +5%)
        if (pct >= 1.0) return "#047857";      // Medium Green (+1% to +3%)
        if (pct > 0.0) return "#065f46";       // Soft Green (+0.1% to +1%)
        if (pct === 0.0) return "#334155";      // Neutral Slate (0%)
        if (pct > -1.0) return "#881337";      // Soft Red (-0.1% to -1%)
        if (pct > -3.0) return "#b91c1c";      // Medium Red (-1% to -3%)
        if (pct > -5.0) return "#dc2626";      // Bright Red (-3% to -5%)
        return "#e11d48";                       // Deep Crimson (-5%+)
    };

    if (typeof d3 === "undefined") {
        container.innerHTML = `<p style="color: var(--mobile-text-sub); padding: 30px; text-align: center;">Loading D3 bubble engine...</p>`;
        return;
    }

    if (mobileHeatmapViewMode === "bubble") {
        // D3 Pack Layout for actual circular Heat Bubbles!
        const hierarchyData = {
            name: "NEPSE",
            children: items
        };

        const root = d3.hierarchy(hierarchyData)
            .sum(d => d.sizeVal ? Math.max(10, d.sizeVal) : 0)
            .sort((a, b) => b.value - a.value);

        d3.pack()
            .size([width, height])
            .padding(4)(root);

        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .style("overflow", "hidden");

        const node = svg.selectAll(".m-bubble-node")
            .data(root.leaves())
            .enter()
            .append("g")
            .attr("class", "m-bubble-node")
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .style("cursor", "pointer")
            .on("click", (event, d) => {
                const s = d.data;
                const isUp = s.diffPct >= 0;
                alert(`📌 ${s.symbol} (${s.fullName})\n• Sector: ${s.sector}\n• LTP: NPR ${s.ltp.toFixed(2)}\n• Change: ${isUp ? '+' : ''}${s.diff.toFixed(2)} (${isUp ? '+' : ''}${s.diffPct.toFixed(2)}%)\n• Volume: ${s.volume.toLocaleString()} shares\n• Turnover: NPR ${s.turnover.toLocaleString()}`);
            });

        // Bubble Circle
        node.append("circle")
            .attr("r", d => Math.max(12, d.r))
            .attr("fill", d => getTileColor(d.data.diffPct))
            .attr("stroke", "rgba(15, 23, 42, 0.8)")
            .attr("stroke-width", "1.5px")
            .style("transition", "transform 0.15s ease");

        // Symbol Label
        node.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", d => (d.r >= 22) ? "-0.2em" : "0.3em")
            .style("font-family", "var(--font-heading)")
            .style("font-weight", "800")
            .style("fill", "#ffffff")
            .style("font-size", d => `${Math.max(9, Math.min(16, Math.round(d.r * 0.45)))}px`)
            .style("text-shadow", "0 1px 3px #000000")
            .text(d => d.data.symbol);

        // Change % Label
        node.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "1.0em")
            .style("font-family", "var(--font-mono)")
            .style("font-weight", "800")
            .style("fill", "#ffffff")
            .style("font-size", d => `${Math.max(8, Math.min(13, Math.round(d.r * 0.35)))}px`)
            .style("display", d => d.r >= 22 ? "block" : "none")
            .style("text-shadow", "0 1px 3px #000000")
            .text(d => `${d.data.diffPct > 0 ? '+' : ''}${d.data.diffPct.toFixed(1)}%`);

    } else {
        // D3 Treemap Layout for Treemap Tiles
        const sectorGroups = {};
        items.forEach(item => {
            const sec = item.sector || "Others";
            if (!sectorGroups[sec]) sectorGroups[sec] = [];
            sectorGroups[sec].push(item);
        });

        const hierarchyData = {
            name: "NEPSE",
            children: Object.keys(sectorGroups).map(sec => ({
                name: sec,
                children: sectorGroups[sec]
            }))
        };

        const root = d3.hierarchy(hierarchyData)
            .sum(d => d.sizeVal ? Math.max(10, d.sizeVal) : 0)
            .sort((a, b) => b.value - a.value);

        d3.treemap()
            .size([width, height])
            .paddingOuter(3)
            .paddingTop(18)
            .paddingInner(2)(root);

        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`);

        const sectorNodes = root.children || [];
        const sectorGroup = svg.selectAll(".m-treemap-sector")
            .data(sectorNodes)
            .enter()
            .append("g")
            .attr("transform", d => `translate(${d.x0},${d.y0})`);

        sectorGroup.append("rect")
            .attr("width", d => Math.max(0, d.x1 - d.x0))
            .attr("height", d => Math.max(0, d.y1 - d.y0))
            .attr("fill", "rgba(15, 23, 42, 0.4)")
            .attr("stroke", "rgba(255,255,255,0.08)");

        sectorGroup.append("text")
            .attr("x", 4)
            .attr("y", 13)
            .style("font-size", "0.68rem")
            .style("font-weight", "800")
            .style("fill", "#f1f5f9")
            .style("text-transform", "uppercase")
            .style("display", d => (d.x1 - d.x0 > 45 && d.y1 - d.y0 > 16) ? "block" : "none")
            .text(d => d.data.name);

        const node = svg.selectAll(".m-treemap-node")
            .data(root.leaves())
            .enter()
            .append("g")
            .attr("transform", d => `translate(${d.x0},${d.y0})`)
            .on("click", (event, d) => {
                const s = d.data;
                const isUp = s.diffPct >= 0;
                alert(`📌 ${s.symbol} (${s.fullName})\n• Sector: ${s.sector}\n• LTP: NPR ${s.ltp.toFixed(2)}\n• Change: ${isUp ? '+' : ''}${s.diff.toFixed(2)} (${isUp ? '+' : ''}${s.diffPct.toFixed(2)}%)\n• Volume: ${s.volume.toLocaleString()} shares\n• Turnover: NPR ${s.turnover.toLocaleString()}`);
            });

        node.append("rect")
            .attr("width", d => Math.max(0, d.x1 - d.x0))
            .attr("height", d => Math.max(0, d.y1 - d.y0))
            .attr("fill", d => getTileColor(d.data.diffPct))
            .attr("rx", 3)
            .attr("ry", 3)
            .attr("stroke", "rgba(15, 23, 42, 0.8)");

        node.append("text")
            .attr("x", d => (d.x1 - d.x0) / 2)
            .attr("y", d => (d.y1 - d.y0) / 2)
            .attr("text-anchor", "middle")
            .style("font-family", "var(--font-heading)")
            .style("font-weight", "800")
            .style("fill", "#ffffff")
            .style("font-size", d => `${Math.max(9, Math.min(14, Math.round(Math.min(d.x1 - d.x0, d.y1 - d.y0) * 0.35)))}px`)
            .style("text-shadow", "0 1px 3px #000000")
            .text(d => d.data.symbol);
    }
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
    if (!state.customWatchlist) {
        const saved = localStorage.getItem("nepse_mobile_watchlist");
        if (saved) {
            try { state.customWatchlist = JSON.parse(saved); } catch(e) {}
        }
    }
    if (!state.customWatchlist || !state.customWatchlist.length) {
        state.customWatchlist = ["ADBL", "SHIVM", "CHCL"];
    }

    const list = state.customWatchlist;
    const listEl = document.getElementById("mWatchlistList");

    if (listEl) {
        if (!list.length) {
            listEl.innerHTML = `
                <div class="mobile-card text-center" style="color: var(--mobile-text-sub); padding: 24px;">
                    Your watchlist is empty.<br>Tap <strong style="color: #34d399; cursor: pointer;" onclick="openMobileAddWatchlistModal()">"+ Add Symbol"</strong> to monitor scrips!
                </div>
            `;
            return;
        }

        listEl.innerHTML = list.map(sym => {
            const s = (state.stocksData || []).find(st => st.symbol === sym);
            const ltp = s ? (s.ltp || s.close || 0) : 0;
            const pct = s ? (s.diff_percent || 0) : 0;
            const isUp = pct >= 0;

            return `
                <div class="mobile-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px;">
                    <div style="flex: 1; cursor: pointer;" onclick="switchMobileTab('liveData')">
                        <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.05rem; color: #fff; display: flex; align-items: center; gap: 8px;">
                            <span>${sym}</span>
                            <span style="font-size: 0.7rem; color: var(--mobile-text-sub); font-family: var(--font-body); font-weight: 500;">${s ? (s.sector || '') : ''}</span>
                        </div>
                        <div style="font-size: 0.74rem; color: var(--mobile-text-sub); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${s ? (s.fullName || sym) : sym}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="text-right">
                            <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: #fff;">NPR ${ltp ? ltp.toFixed(2) : '0.00'}</div>
                            <span class="mobile-badge ${isUp ? 'up' : 'down'}">${isUp ? '▲ +' : '▼ '}${Math.abs(pct).toFixed(2)}%</span>
                        </div>
                        <button onclick="removeMobileWatchlistSymbol('${sym}')" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; cursor: pointer;">🗑️</button>
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

window.openMobileAddWatchlistModal = function() {
    document.getElementById("mAddWatchlistModal")?.classList.add("active");
};

window.closeMobileModal = function(id) {
    document.getElementById(id)?.classList.remove("active");
};

window.saveMobileWatchlistSymbol = function() {
    const input = document.getElementById("mWatchlistSymbolInput");
    const sym = input?.value ? input.value.trim().toUpperCase() : "";
    if (!sym) return alert("Please enter a valid NEPSE stock symbol!");

    if (!state.customWatchlist) {
        state.customWatchlist = ["ADBL", "SHIVM", "CHCL"];
    }

    if (!state.customWatchlist.includes(sym)) {
        state.customWatchlist.push(sym);
        localStorage.setItem("nepse_mobile_watchlist", JSON.stringify(state.customWatchlist));
    }

    if (input) input.value = "";
    closeMobileModal("mAddWatchlistModal");
    renderMobileWatchlist();
};

window.removeMobileWatchlistSymbol = function(sym) {
    if (!state.customWatchlist) return;
    state.customWatchlist = state.customWatchlist.filter(s => s !== sym);
    localStorage.setItem("nepse_mobile_watchlist", JSON.stringify(state.customWatchlist));
    renderMobileWatchlist();
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

    if (localStorage.getItem("nepse_logged_in") === "true") {
        const username = localStorage.getItem("nepse_user_email");
        if (username && typeof syncToSupabase === "function") {
            syncToSupabase(username, state.portfolioHoldings, []);
        }
    }

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

// -------------------------------------------------------------
// 7. Mobile User Authentication & Cloud Sync
// -------------------------------------------------------------
window.openMobileAuthModal = function() {
    document.getElementById("mAuthModal")?.classList.add("active");
};

window.toggleMobileAuthAction = function(e) {
    if (e) e.preventDefault();
    const actionInput = document.getElementById("mAuthActionType");
    const submitBtn = document.getElementById("mAuthSubmitBtn");
    const toggleBtn = document.getElementById("mAuthToggleBtn");

    if (!actionInput) return;

    if (actionInput.value === "login") {
        actionInput.value = "signup";
        if (submitBtn) submitBtn.innerHTML = `<span>✨ Register & Create Profile</span>`;
        if (toggleBtn) toggleBtn.textContent = "Already registered? Sign in";
    } else {
        actionInput.value = "login";
        if (submitBtn) submitBtn.innerHTML = `<span>🔐 Authenticate & Sync Cloud Portfolio</span>`;
        if (toggleBtn) toggleBtn.textContent = "Create a new profile";
    }
};

window.handleMobileLoginSubmit = async function(e) {
    if (e) e.preventDefault();
    const username = document.getElementById("mAuthUsername")?.value.trim().toLowerCase();
    const password = document.getElementById("mAuthPassword")?.value.trim();
    const action = document.getElementById("mAuthActionType")?.value || "login";
    const submitBtn = document.getElementById("mAuthSubmitBtn");

    if (!username || !password) return alert("Please enter both username and 4-digit passcode!");
    if (!/^\d{4}$/.test(password)) return alert("Passcode must be exactly 4 digits!");

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳ Authenticating with Supabase...</span>`;
    }

    let authRes = { success: true };
    if (typeof authenticateOrCreateUser === "function") {
        authRes = await authenticateOrCreateUser(username, password, action);
    }

    if (!authRes.success) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = action === "signup" ? `<span>✨ Register & Create Profile</span>` : `<span>🔐 Authenticate & Sync Cloud Portfolio</span>`;
        }
        return alert(authRes.error || "Authentication failed.");
    }

    // Save session
    localStorage.setItem("nepse_logged_in", "true");
    localStorage.setItem("nepse_user_email", username);
    localStorage.setItem("nepse_portfolio_username", username);

    if (authRes.isNew) {
        // Fresh start for newly created user profile
        state.portfolioHoldings = [];
        state.customWatchlist = [];
        localStorage.setItem("nepse_mobile_watchlist", JSON.stringify([]));

        if (typeof syncToSupabase === "function") {
            try {
                await syncToSupabase(username, [], []);
                if (typeof syncWatchlistToSupabase === "function") {
                    await syncWatchlistToSupabase(username, []);
                }
            } catch (err) {
                console.warn("Mobile Supabase new user init warning:", err);
            }
        }
    } else {
        // Sync existing portfolio from Supabase
        if (typeof syncFromSupabase === "function") {
            try {
                const syncRes = await syncFromSupabase(username, state.portfolioHoldings || [], []);
                if (syncRes) {
                    state.portfolioHoldings = syncRes.holdings || [];
                    if (syncRes.watchlist) state.customWatchlist = syncRes.watchlist;
                }
            } catch (err) {
                console.warn("Mobile Supabase sync error:", err);
            }
        }
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>🔐 Authenticate & Sync Cloud Portfolio</span>`;
    }

    closeMobileModal("mAuthModal");
    updateMobileUserUI();
    renderMobilePortfolio();
    alert(`🎉 Welcome ${username}! Cloud Portfolio Synced Successfully.`);
};

window.handleMobileLogout = function() {
    if (confirm("Are you sure you want to sign out? Your local offline session will end.")) {
        localStorage.removeItem("nepse_logged_in");
        localStorage.removeItem("nepse_user_email");
        localStorage.removeItem("nepse_portfolio_username");
        updateMobileUserUI();
        renderMobilePortfolio();
    }
};

function updateMobileUserUI() {
    const isLoggedIn = localStorage.getItem("nepse_logged_in") === "true";
    const username = localStorage.getItem("nepse_user_email") || "Guest User";

    const headerBtn = document.getElementById("mAuthHeaderBtn");
    const nameEl = document.getElementById("mUserDisplayName");
    const statusEl = document.getElementById("mUserSyncStatus");
    const actionBtn = document.getElementById("mUserAuthActionBtn");
    const avatarEl = document.getElementById("mUserAvatarIcon");

    if (isLoggedIn) {
        if (headerBtn) {
            headerBtn.textContent = `👤 ${username}`;
            headerBtn.style.background = "rgba(16, 185, 129, 0.2)";
            headerBtn.style.borderColor = "rgba(16, 185, 129, 0.4)";
            headerBtn.style.color = "#34d399";
        }
        if (nameEl) nameEl.textContent = username;
        if (statusEl) statusEl.textContent = "☁️ Supabase Cloud Synced";
        if (avatarEl) avatarEl.textContent = "🟢";
        if (actionBtn) {
            actionBtn.textContent = "🚪 Sign Out";
            actionBtn.setAttribute("onclick", "handleMobileLogout()");
            actionBtn.style.borderColor = "rgba(239, 68, 68, 0.4)";
            actionBtn.style.color = "#f87171";
        }
    } else {
        if (headerBtn) {
            headerBtn.textContent = "🔐 Sign In";
            headerBtn.style.background = "rgba(99, 102, 241, 0.2)";
            headerBtn.style.borderColor = "rgba(99, 102, 241, 0.4)";
            headerBtn.style.color = "#a5b4fc";
        }
        if (nameEl) nameEl.textContent = "Guest User";
        if (statusEl) statusEl.textContent = "Local Storage Mode";
        if (avatarEl) avatarEl.textContent = "👤";
        if (actionBtn) {
            actionBtn.textContent = "🔐 Sign In / Sync";
            actionBtn.setAttribute("onclick", "openMobileAuthModal()");
            actionBtn.style.borderColor = "rgba(99, 102, 241, 0.4)";
            actionBtn.style.color = "#a5b4fc";
        }
    }
}
