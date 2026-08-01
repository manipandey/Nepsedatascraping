/* -------------------------------------------------------------
 * NEPSE Terminal Clientside Engine
 * ------------------------------------------------------------- */

// Application State
let stocksData = [];
let summaryData = {};
let tradeDate = "";
let currentFilter = "all";
let searchQuery = "";
let sortColumn = "symbol";
let sortDirection = "asc"; // 'asc' or 'desc'

// DOM Elements Cache
const elements = {
    tradeDate: document.getElementById("tradeDate"),
    marketStatus: document.getElementById("marketStatus"),
    marketStatusBadge: document.getElementById("marketStatusBadge"),
    refreshBtn: document.getElementById("refreshBtn"),
    
    summaryTurnover: document.getElementById("summaryTurnover"),
    summaryVolume: document.getElementById("summaryVolume"),
    summaryTransactions: document.getElementById("summaryTransactions"),
    
    breadthAdvancers: document.getElementById("breadthAdvancers"),
    breadthUnchanged: document.getElementById("breadthUnchanged"),
    breadthDecliners: document.getElementById("breadthDecliners"),
    barAdvancers: document.getElementById("barAdvancers"),
    barUnchanged: document.getElementById("barUnchanged"),
    barDecliners: document.getElementById("barDecliners"),
    
    stockSearch: document.getElementById("stockSearch"),
    clearSearch: document.getElementById("clearSearch"),
    resultsCount: document.getElementById("resultsCount"),
    
    tableBody: document.getElementById("stocksTableBody"),
    tableHeaders: document.querySelectorAll("#stocksTable th.sortable"),
    
    // Modal Details Elements
    detailDialog: document.getElementById("stockDetailDialog"),
    closeDialogBtn: document.getElementById("closeDialogBtn"),
    closeDialogBtnFooter: document.getElementById("closeDialogBtnFooter"),
    detailSymbol: document.getElementById("detailSymbol"),
    detailClose: document.getElementById("detailClose"),
    detailDiff: document.getElementById("detailDiff"),
    detailDiffPercent: document.getElementById("detailDiffPercent"),
    detailPriceChangeContainer: document.getElementById("detailPriceChangeContainer"),
    
    detail52Low: document.getElementById("detail52Low"),
    detail52High: document.getElementById("detail52High"),
    detailRangeIndicator: document.getElementById("detailRangeIndicator"),
    detailRangeDesc: document.getElementById("detailRangeDesc"),
    
    detailOpen: document.getElementById("detailOpen"),
    detailHigh: document.getElementById("detailHigh"),
    detailLow: document.getElementById("detailLow"),
    detailPrevClose: document.getElementById("detailPrevClose"),
    detailVolume: document.getElementById("detailVolume"),
    detailTurnover: document.getElementById("detailTurnover"),
    detailTrades: document.getElementById("detailTrades"),
    detailConfidence: document.getElementById("detailConfidence"),
    
    pivotR2: document.getElementById("pivotR2"),
    pivotR1: document.getElementById("pivotR1"),
    pivotPP: document.getElementById("pivotPP"),
    pivotS1: document.getElementById("pivotS1"),
    pivotS2: document.getElementById("pivotS2"),
};

// Formatting Utilities
const formatters = {
    number: (val) => new Intl.NumberFormat('en-US').format(val),
    currency: (val) => {
        if (val >= 10000000) { // 1 Crore NPR
            return `NPR ${(val / 10000000).toFixed(2)} Cr`;
        } else if (val >= 100000) { // 1 Lakh NPR
            return `NPR ${(val / 100000).toFixed(2)} Lk`;
        }
        return `NPR ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)}`;
    },
    decimal: (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val),
    percent: (val) => `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
};

// -------------------------------------------------------------
// Live Market Status Checker
// -------------------------------------------------------------
function updateMarketStatus() {
    // NEPSE local trading hours: Sunday (0) to Thursday (4) from 11:00 AM to 3:00 PM local time (UTC+5:45)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    // Nepal Time is UTC + 5:45
    const nepalTime = new Date(utc + (3600000 * 5.75));
    
    const day = nepalTime.getDay();
    const hours = nepalTime.getHours();
    const minutes = nepalTime.getMinutes();
    const timeVal = hours + minutes / 60;
    
    const isOpenDay = (day >= 0 && day <= 4); // Sunday (0) - Thursday (4)
    const isOpenTime = (timeVal >= 11.0 && timeVal <= 15.0); // 11:00 AM - 3:00 PM
    
    if (isOpenDay && isOpenTime) {
        elements.marketStatusBadge.classList.add("open");
        elements.marketStatus.textContent = "Live Trading";
    } else {
        elements.marketStatusBadge.classList.remove("open");
        elements.marketStatus.textContent = "Market Closed";
    }
}

// -------------------------------------------------------------
// Data Loading Engine
// -------------------------------------------------------------
async function fetchStockData() {
    try {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center loading-placeholder">
                    <div class="spinner"></div>
                    Updating stock terminal data...
                </td>
            </tr>
        `;
        
        // Fetch the generated today JSON file
        const response = await fetch("data/nepse_today.json?t=" + new Date().getTime());
        if (!response.ok) {
            throw new Error("Local NEPSE data file not found.");
        }
        
        const data = await response.json();
        stocksData = data.stocks || [];
        summaryData = data.summary || {};
        tradeDate = data.date || "Unknown";
        
        // Populate UI
        elements.tradeDate.textContent = tradeDate;
        updateMarketStatus();
        renderSummary();
        renderTable();
        
    } catch (error) {
        console.error("Error loading NEPSE data:", error);
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center val-down" style="padding: 3rem 0;">
                    ⚠️ Error loading stock data: ${error.message}<br>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem; display: inline-block;">
                        Please ensure you have run the scraper script to generate the database.
                    </span>
                </td>
            </tr>
        `;
    }
}

// -------------------------------------------------------------
// Render Summary Statistics Cards
// -------------------------------------------------------------
function renderSummary() {
    elements.summaryTurnover.textContent = formatters.currency(summaryData.total_turnover || 0);
    elements.summaryVolume.textContent = formatters.number(summaryData.total_volume || 0);
    elements.summaryTransactions.textContent = formatters.number(summaryData.total_transactions || 0);
    
    const adv = summaryData.advancers || 0;
    const dec = summaryData.decliners || 0;
    const flat = summaryData.unchanged || 0;
    const total = adv + dec + flat || 1;
    
    elements.breadthAdvancers.textContent = `${adv} ▲`;
    elements.breadthUnchanged.textContent = `${flat} =`;
    elements.breadthDecliners.textContent = `${dec} ▼`;
    
    elements.barAdvancers.style.width = `${(adv / total) * 100}%`;
    elements.barUnchanged.style.width = `${(flat / total) * 100}%`;
    elements.barDecliners.style.width = `${(dec / total) * 100}%`;
}

// -------------------------------------------------------------
// Render and Filter Stocks Data Table
// -------------------------------------------------------------
function renderTable() {
    // 1. Apply Filter Tabs
    let filtered = [...stocksData];
    if (currentFilter === "gainers") {
        filtered = filtered.filter(s => s.diff > 0);
    } else if (currentFilter === "losers") {
        filtered = filtered.filter(s => s.diff < 0);
    } else if (currentFilter === "turnover") {
        // High turnover filter (sort helper in render handles this, but let's keep all, sorted differently)
    } else if (currentFilter === "volume") {
        // High volume filter
    } else if (currentFilter === "breakouts") {
        // High price breakouts (Close close to 52 Week High, within 1.5%)
        filtered = filtered.filter(s => s.fifty_two_week_high > 0 && (s.close >= s.fifty_two_week_high * 0.985));
    }
    
    // 2. Apply Text Search
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(s => s.symbol.toLowerCase().includes(query));
    }
    
    // 3. Apply Column Sorting
    filtered.sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];
        
        // Handle strings comparison case insensitively
        if (typeof valA === "string") {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        
        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
    });
    
    // Update Results Label
    elements.resultsCount.textContent = `Showing ${filtered.length} of ${stocksData.length} securities`;
    
    // Render Rows
    if (filtered.length === 0) {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center" style="padding: 3rem 0; color: var(--text-muted);">
                    No matching stocks found for "${searchQuery}" in this category.
                </td>
            </tr>
        `;
        return;
    }
    
    elements.tableBody.innerHTML = filtered.map(s => {
        const diffClass = s.diff > 0 ? "val-up" : (s.diff < 0 ? "val-down" : "val-flat");
        const badgeClass = s.diff > 0 ? "badge-change bg-up val-up" : (s.diff < 0 ? "badge-change bg-down val-down" : "badge-change bg-flat val-flat");
        
        return `
            <tr data-symbol="${s.symbol}">
                <td class="monospace font-bold">${s.symbol}</td>
                <td class="text-right monospace">${formatters.decimal(s.open)}</td>
                <td class="text-right monospace">${formatters.decimal(s.high)}</td>
                <td class="text-right monospace">${formatters.decimal(s.low)}</td>
                <td class="text-right monospace font-bold">${formatters.decimal(s.close)}</td>
                <td class="text-right monospace text-muted">${formatters.decimal(s.prev_close)}</td>
                <td class="text-right monospace ${diffClass}">${s.diff > 0 ? '+' : ''}${formatters.decimal(s.diff)}</td>
                <td class="text-right monospace">
                    <span class="${badgeClass}">${formatters.percent(s.diff_percent)}</span>
                </td>
                <td class="text-right monospace">${formatters.number(s.volume)}</td>
                <td class="text-right monospace">${formatters.number(s.turnover)}</td>
                <td class="text-right monospace">${formatters.number(s.transactions)}</td>
            </tr>
        `;
    }).join("");
    
    // Bind click events to new rows
    elements.tableBody.querySelectorAll("tr").forEach(row => {
        row.addEventListener("click", () => {
            const sym = row.getAttribute("data-symbol");
            openDetailModal(sym);
        });
    });
}

// -------------------------------------------------------------
// Interactive Sorting Handler
// -------------------------------------------------------------
function handleHeaderClick(header) {
    const col = header.getAttribute("data-sort");
    
    // Reset sort states on other headers
    elements.tableHeaders.forEach(th => {
        if (th !== header) {
            th.classList.remove("asc", "desc");
        }
    });
    
    if (sortColumn === col) {
        // Toggle direction
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
        sortColumn = col;
        sortDirection = "desc"; // Default to desc for number columns
        if (col === "symbol") sortDirection = "asc";
    }
    
    header.classList.remove("asc", "desc");
    header.classList.add(sortDirection);
    
    renderTable();
}

// -------------------------------------------------------------
// Detailed Stock Statistics Modal
// -------------------------------------------------------------
function openDetailModal(symbol) {
    const stock = stocksData.find(s => s.symbol === symbol);
    if (!stock) return;
    
    // Basic Details
    elements.detailSymbol.textContent = stock.symbol;
    elements.detailClose.textContent = `NPR ${formatters.decimal(stock.close)}`;
    elements.detailDiff.textContent = `${stock.diff > 0 ? '+' : ''}${formatters.decimal(stock.diff)}`;
    elements.detailDiffPercent.textContent = `(${formatters.percent(stock.diff_percent)})`;
    
    // Color Coding Price Change Container
    elements.detailPriceChangeContainer.className = "detail-price-change";
    if (stock.diff > 0) {
        elements.detailPriceChangeContainer.classList.add("bg-up", "val-up");
    } else if (stock.diff < 0) {
        elements.detailPriceChangeContainer.classList.add("bg-down", "val-down");
    } else {
        elements.detailPriceChangeContainer.classList.add("bg-flat", "val-flat");
    }
    
    // Metrics Grid
    elements.detailOpen.textContent = formatters.decimal(stock.open);
    elements.detailHigh.textContent = formatters.decimal(stock.high);
    elements.detailLow.textContent = formatters.decimal(stock.low);
    elements.detailPrevClose.textContent = formatters.decimal(stock.prev_close);
    elements.detailVolume.textContent = formatters.number(stock.volume);
    elements.detailTurnover.textContent = formatters.currency(stock.turnover);
    elements.detailTrades.textContent = formatters.number(stock.transactions);
    elements.detailConfidence.textContent = stock.confidence.toFixed(2);
    
    // 52 Week Bounds
    elements.detail52Low.textContent = formatters.decimal(stock.fifty_two_week_low || stock.low);
    elements.detail52High.textContent = formatters.decimal(stock.fifty_two_week_high || stock.high);
    
    // Range position calculation
    const low52 = stock.fifty_two_week_low || stock.low;
    const high52 = stock.fifty_two_week_high || stock.high;
    const range = high52 - low52;
    let pct = 50;
    if (range > 0) {
        pct = ((stock.close - low52) / range) * 100;
        pct = Math.max(0, Math.min(100, pct));
    }
    elements.detailRangeIndicator.style.left = `${pct}%`;
    
    // Set Range text summary
    if (pct >= 85) {
        elements.detailRangeDesc.innerHTML = "🔥 Trading near 52-week High (Bullish Momentum)";
    } else if (pct <= 15) {
        elements.detailRangeDesc.innerHTML = "❄️ Trading near 52-week Low (Bearish Zone)";
    } else {
        elements.detailRangeDesc.innerHTML = `Stock is trading at <strong>${pct.toFixed(0)}%</strong> of its 52-week range`;
    }
    
    // Pivot Points (Day Trading Levels)
    // Formula:
    // PP = (High + Low + Close) / 3
    // R1 = (2 * PP) - Low
    // S1 = (2 * PP) - High
    // R2 = PP + (High - Low)
    // S2 = PP - (High - Low)
    const pp = (stock.high + stock.low + stock.close) / 3;
    const r1 = (2 * pp) - stock.low;
    const s1 = (2 * pp) - stock.high;
    const r2 = pp + (stock.high - stock.low);
    const s2 = pp - (stock.high - stock.low);
    
    elements.pivotPP.textContent = formatters.decimal(pp);
    elements.pivotR1.textContent = formatters.decimal(r1);
    elements.pivotR2.textContent = formatters.decimal(r2);
    elements.pivotS1.textContent = formatters.decimal(s1);
    elements.pivotS2.textContent = formatters.decimal(s2);
    
    // Open Dialog Modal
    elements.detailDialog.showModal();
}

// -------------------------------------------------------------
// Interactive Events Bindings
// -------------------------------------------------------------

// Refresh button trigger (calls custom backend API built in run.py)
elements.refreshBtn.addEventListener("click", async () => {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!isLocal) {
        alert("🔒 Live On-Demand Scraping is disabled in the cloud version to prevent rate limiting.\n\nThis dashboard is automatically updated every trading day at 3:15 PM NST via GitHub Actions.\n\nTo run live on-demand scrapes, clone this repository and run locally using:\npython3 run.py");
        return;
    }

    if (elements.refreshBtn.classList.contains("loading")) return;
    
    elements.refreshBtn.classList.add("loading");
    elements.refreshBtn.innerHTML = `<span class="btn-icon">🔄</span> Scraping Live Data...`;
    
    try {
        const response = await fetch("/api/scrape");
        const result = await response.json();
        if (result.success) {
            await fetchStockData();
        } else {
            alert("Scraping trigger failed. Check server logs.");
        }
    } catch (e) {
        console.error("Failed to re-scrape:", e);
        alert("Could not connect to scraping endpoint. Please check if run.py server is running.");
    } finally {
        elements.refreshBtn.classList.remove("loading");
        elements.refreshBtn.innerHTML = `<span class="btn-icon">🔄</span> Re-Scrape Data`;
    }
});

// Search input bindings
elements.stockSearch.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    elements.clearSearch.style.display = searchQuery ? "block" : "none";
    renderTable();
});

elements.clearSearch.addEventListener("click", () => {
    elements.stockSearch.value = "";
    searchQuery = "";
    elements.clearSearch.style.display = "none";
    elements.stockSearch.focus();
    renderTable();
});

// Tab Filters bindings
document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        currentFilter = tab.getAttribute("data-filter");
        
        // Adjust sorting depending on tab selection for convenience
        if (currentFilter === "gainers") {
            sortColumn = "diff_percent";
            sortDirection = "desc";
        } else if (currentFilter === "losers") {
            sortColumn = "diff_percent";
            sortDirection = "asc";
        } else if (currentFilter === "turnover") {
            sortColumn = "turnover";
            sortDirection = "desc";
        } else if (currentFilter === "volume") {
            sortColumn = "volume";
            sortDirection = "desc";
        } else {
            sortColumn = "symbol";
            sortDirection = "asc";
        }
        
        // Highlight corresponding table headers
        elements.tableHeaders.forEach(th => {
            th.classList.remove("asc", "desc");
            if (th.getAttribute("data-sort") === sortColumn) {
                th.classList.add(sortDirection);
            }
        });
        
        renderTable();
    });
});

// Table sorting header click event
elements.tableHeaders.forEach(th => {
    th.addEventListener("click", () => handleHeaderClick(th));
});

// Dialog closing triggers
elements.closeDialogBtn.addEventListener("click", () => elements.detailDialog.close());
elements.closeDialogBtnFooter.addEventListener("click", () => elements.detailDialog.close());

// Light Dismiss Dialog Fallback for Safari / Older Browsers
if (!('closedBy' in HTMLDialogElement.prototype)) {
    elements.detailDialog.addEventListener("click", (event) => {
        if (event.target !== elements.detailDialog) return;
        const rect = elements.detailDialog.getBoundingClientRect();
        const isDialogContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
        );
        if (!isDialogContent) {
            elements.detailDialog.close();
        }
    });
}

// -------------------------------------------------------------
// App Startup Initialization
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    fetchStockData();
    // Periodically update the status indicator every minute
    setInterval(updateMarketStatus, 60000);
});
