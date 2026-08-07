/* -------------------------------------------------------------
 * NEPSE & SystemXLite Terminal Dashboard & Journal Engine
 * ------------------------------------------------------------- */

// Global Application State
let stocksData = [];
let indicesData = [];
let systemxData = {};
let masterTickers = [];   // Full NEPSE 329+ ticker master list
let liveRefreshTimer = null;
const LIVE_REFRESH_INTERVAL_MS = 30000; // 30 seconds
let currentFilter = "all";
let selectedSector = "all";
let searchQuery = "";
let sortColumn = "symbol";
let sortDirection = "asc";
let currentPage = 1;
let rowsPerPage = 25; // 25, 50, 100, "all"

// LocalStorage Persistence Keys
const PORTFOLIO_STORAGE_KEY = "nepse_portfolio_v3";
const JOURNAL_STORAGE_KEY = "nepse_journal_v3";

// Portfolio & Journal Local Repositories with Initial Rich Demo Data
let portfolioHoldings = JSON.parse(localStorage.getItem(PORTFOLIO_STORAGE_KEY)) || [
    {
        id: 1,
        symbol: "ADBL",
        shares: 100,
        buyPrice: 280.0,
        tp: 330.0,
        sl: 260.0,
        setup: "Breakout",
        notes: "Daily breakout above resistance with strong institutional volume support."
    },
    {
        id: 2,
        symbol: "NICA",
        shares: 50,
        buyPrice: 420.0,
        tp: 490.0,
        sl: 395.0,
        setup: "Dip Buy",
        notes: "Bought key support level bounce at 20-day moving average."
    }
];

let tradeJournal = JSON.parse(localStorage.getItem(JOURNAL_STORAGE_KEY)) || [
    {
        id: 1,
        date: "2026-08-01",
        symbol: "NTC",
        type: "BUY",
        qty: 100,
        entry: 820.0,
        exit: 880.0,
        tp: 900.0,
        sl: 790.0,
        setup: "Swing Trade",
        notes: "Clean swing trade after sector reversal pattern."
    }
];

// Helper Utilities
const formatNPR = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "NPR 0.00";
    return "NPR " + Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatNumber = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return Number(val).toLocaleString("en-IN");
};

const savePortfolio = () => {
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(portfolioHoldings));
    renderPortfolioView();
};

const saveJournal = () => {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(tradeJournal));
    renderJournalView();
};

// Main Initialization
document.addEventListener("DOMContentLoaded", async () => {
    initNavigation();
    initEventListeners();
    await loadMasterTickers();
    await fetchData();
    startLiveRefresh();
});

// Load master ticker list (329+ NEPSE companies from merolagani)
async function loadMasterTickers() {
    try {
        const res = await fetch(`/api/all-tickers?t=${Date.now()}`);
        masterTickers = await res.json();
        console.log(`[Master] Loaded ${masterTickers.length} NEPSE tickers`);
        populateTickerDropdowns();
    } catch (e) {
        console.warn("Master ticker list not available, will use live data only.");
    }
}

// Start 30-second live price auto-refresh
function startLiveRefresh() {
    if (liveRefreshTimer) clearInterval(liveRefreshTimer);
    liveRefreshTimer = setInterval(fetchLiveTick, LIVE_REFRESH_INTERVAL_MS);
    console.log(`[Live] Auto-refresh started: every ${LIVE_REFRESH_INTERVAL_MS / 1000}s`);
}

// Lightweight live tick fetch — only stocks + indices from API
async function fetchLiveTick() {
    try {
        const res = await fetch(`/api/live-tick?t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Update global state by merging live ticks into existing stocksData
        if (data.stocks && data.stocks.length) {
            const tickMap = {};
            data.stocks.forEach(s => tickMap[s.symbol] = s);
            stocksData = stocksData.map(s => {
                const live = tickMap[s.symbol];
                return live ? { ...s, ...live } : s;
            });
            if (stocksData.length === 0) {
                stocksData = data.stocks;
            }
        }
        if (data.indices && data.indices.length) {
            indicesData = data.indices;
        }

        // Update timestamp displays
        const timeStr = data.scraped_at ? data.scraped_at.split(" ")[1] : new Date().toLocaleTimeString();
        const updEl = document.getElementById("lastUpdatedTime");
        if (updEl) updEl.textContent = `Live ● ${timeStr}`;

        const dateEl = document.getElementById("tradeDate");
        if (dateEl) dateEl.textContent = data.date || new Date().toISOString().split("T")[0];

        // Re-render live components
        renderSummaryGrid(data);
        renderIndicesGrid();
        renderStocksTable();
        renderStrategyView();

        // Check real-time price alerts & portfolio TP/SL hits
        checkPriceAlerts();
        checkPortfolioTPSLAlerts();

        // Update portfolio TP/SL if visible
        const portfolioView = document.getElementById("portfolioView");
        if (portfolioView && !portfolioView.classList.contains("hidden")) {
            renderPortfolioView();
        }

        // Update Heat Bubble map if visible
        const bubbleView = document.getElementById("heatbubbleView");
        if (bubbleView && !bubbleView.classList.contains("hidden")) {
            renderHeatbubbleView();
        }

        // Flash the status indicator
        const statusDot = document.querySelector(".status-indicator");
        if (statusDot) {
            statusDot.style.background = "#10b981";
            statusDot.style.boxShadow = "0 0 8px #10b981";
            setTimeout(() => {
                statusDot.style.background = "";
                statusDot.style.boxShadow = "";
            }, 800);
        }

        console.log(`[Live] Updated ${stocksData.length} stocks + ${indicesData.length} indices at ${timeStr}`);
    } catch (err) {
        console.warn("[Live] Tick fetch error:", err.message);
        const updEl = document.getElementById("lastUpdatedTime");
        if (updEl) updEl.textContent = `Offline ● Retry in 30s`;
    }
}

// Navigation Handling
function initNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item[data-view]");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const viewTarget = item.getAttribute("data-view");

            navItems.forEach(n => n.classList.remove("active"));
            item.classList.add("active");

            // Hide all views
            document.querySelectorAll(".view-section").forEach(v => v.classList.add("hidden"));

            const targetSection = document.getElementById(`${viewTarget}View`);
            if (targetSection) {
                targetSection.classList.remove("hidden");
            }

            // Update Header Title
            const pageTitle = document.getElementById("pageTitle");
            if (pageTitle) {
                if (viewTarget === "dashboard") pageTitle.textContent = "Market Overview & All Scrips";
                else if (viewTarget === "portfolio") { pageTitle.textContent = "Portfolio Tracker & Journal"; renderPortfolioView(); }
                else if (viewTarget === "journal") { pageTitle.textContent = "Trading Journal"; renderJournalView(); }
                else if (viewTarget === "dalal") { pageTitle.textContent = "Dalal Street Signals"; renderDalalView(); }
                else if (viewTarget === "strategy") { pageTitle.textContent = "🎯 EMA 20>50>100 + Fractal Low Sweep Strategy Radar"; renderStrategyView(); }
                else if (viewTarget === "lockin") { pageTitle.textContent = "🔒 Promoter Lock-in Expiry Tracker"; renderLockinView(); }
                else if (viewTarget === "floorsheet") { pageTitle.textContent = "🔍 Institutional Floorsheet Intelligence"; renderFloorsheetView(); }
                else if (viewTarget === "watchlist") { pageTitle.textContent = "⭐ Real-Time Watchlist & Price Alerts"; renderWatchlistView(); }
                else if (viewTarget === "heatbubble") { pageTitle.textContent = "🫧 Dynamic NEPSE Heat Bubble Map"; renderHeatbubbleView(); }
            }
        });
    });
}


function initEventListeners() {
    initPositionCalcEngine();

    // Refresh / Re-Scrape Button
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `<span class="btn-icon">🔄</span> Syncing NEPSE Data...`;
            try {
                const res = await fetch("/api/scrape");
                const json = await res.json();
                if (json.success) {
                    await fetchData();
                } else {
                    alert("Re-scrape complete with warning.");
                }
            } catch (err) {
                console.error("Re-scrape error:", err);
                alert("Error triggering re-scrape.");
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = `<span class="btn-icon">🔄</span> Sync Live Data`;
            }
        });
    }

    // Global Quick Search Input
    const globalQuickSearch = document.getElementById("globalQuickSearch");
    if (globalQuickSearch) {
        globalQuickSearch.addEventListener("input", (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            currentPage = 1;
            renderStocksTable();
        });
    }

    // Keyboard Shortcut '/' to focus Quick Search
    document.addEventListener("keydown", (e) => {
        if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA" && document.activeElement.tagName !== "SELECT") {
            e.preventDefault();
            const searchInput = document.getElementById("globalQuickSearch") || document.getElementById("stockSearch");
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    // Dashboard Search Input
    const stockSearch = document.getElementById("stockSearch");
    const clearSearch = document.getElementById("clearSearch");
    if (stockSearch) {
        stockSearch.addEventListener("input", (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            if (globalQuickSearch) globalQuickSearch.value = e.target.value;
            clearSearch.style.display = searchQuery ? "block" : "none";
            currentPage = 1;
            renderStocksTable();
        });
    }
    if (clearSearch) {
        clearSearch.addEventListener("click", () => {
            if (stockSearch) stockSearch.value = "";
            if (globalQuickSearch) globalQuickSearch.value = "";
            searchQuery = "";
            clearSearch.style.display = "none";
            currentPage = 1;
            renderStocksTable();
        });
    }

    // Sector Filter Dropdown
    const sectorFilterSelect = document.getElementById("sectorFilterSelect");
    if (sectorFilterSelect) {
        sectorFilterSelect.addEventListener("change", (e) => {
            selectedSector = e.target.value;
            currentPage = 1;
            renderStocksTable();
        });
    }

    // Pagination Button Listeners
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const rowsPerPageSelect = document.getElementById("rowsPerPageSelect");

    if (prevPageBtn) {
        prevPageBtn.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage--;
                renderStocksTable();
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener("click", () => {
            currentPage++;
            renderStocksTable();
        });
    }

    if (rowsPerPageSelect) {
        rowsPerPageSelect.addEventListener("change", (e) => {
            rowsPerPage = e.target.value;
            currentPage = 1;
            renderStocksTable();
        });
    }

    // Filter Tabs
    document.querySelectorAll(".filter-tab[data-filter]").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".filter-tab[data-filter]").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentFilter = tab.getAttribute("data-filter");
            sortColumn = "default";
            sortDirection = "asc";
            updateSortIndicators();
            renderStocksTable();
        });
    });

    // Dalal Sub-Navigation Filter Tabs
    document.querySelectorAll("[data-dalal-tab]").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll("[data-dalal-tab]").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const targetTab = tab.getAttribute("data-dalal-tab");
            
            const accumPanel = document.getElementById("jasoosAccumulationContainer")?.closest(".summary-card");
            const distPanel = document.getElementById("jasoosDistributionContainer")?.closest(".summary-card");
            const moversPanel = document.getElementById("moversContainer")?.closest(".summary-card");
            const popularPanel = document.getElementById("popularContainer")?.closest(".summary-card");
            const leadersPanel = document.getElementById("leadersContainer")?.closest(".table-card");

            if (targetTab === "all") {
                [accumPanel, distPanel, moversPanel, popularPanel, leadersPanel].forEach(p => p && (p.style.display = "block"));
            } else if (targetTab === "accumulation") {
                [distPanel, moversPanel, popularPanel, leadersPanel].forEach(p => p && (p.style.display = "none"));
                if (accumPanel) accumPanel.style.display = "block";
            } else if (targetTab === "distribution") {
                [accumPanel, moversPanel, popularPanel, leadersPanel].forEach(p => p && (p.style.display = "none"));
                if (distPanel) distPanel.style.display = "block";
            } else if (targetTab === "movers") {
                [accumPanel, distPanel, popularPanel, leadersPanel].forEach(p => p && (p.style.display = "none"));
                if (moversPanel) moversPanel.style.display = "block";
            } else if (targetTab === "popular") {
                [accumPanel, distPanel, moversPanel, leadersPanel].forEach(p => p && (p.style.display = "none"));
                if (popularPanel) popularPanel.style.display = "block";
            } else if (targetTab === "leaders") {
                [accumPanel, distPanel, moversPanel, popularPanel].forEach(p => p && (p.style.display = "none"));
                if (leadersPanel) leadersPanel.style.display = "block";
            }
        });
    });

    // Table Header Sort Click
    document.querySelectorAll("#stocksTable th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.getAttribute("data-sort");
            if (sortColumn === col) {
                sortDirection = sortDirection === "asc" ? "desc" : "asc";
            } else {
                sortColumn = col;
                sortDirection = "desc";
            }
            updateSortIndicators();
            renderStocksTable();
        });
    });

    // Stock Detail Dialog Close
    const dialog = document.getElementById("stockDetailDialog");
    const closeBtn = document.getElementById("closeDialogBtn");
    const closeBtnFooter = document.getElementById("closeDialogBtnFooter");
    if (closeBtn) closeBtn.addEventListener("click", () => dialog.close());
    if (closeBtnFooter) closeBtnFooter.addEventListener("click", () => dialog.close());

    // Holding Dialog Elements
    const holdingDialog = document.getElementById("holdingDialog");
    const btnOpenAddHolding = document.getElementById("btnOpenAddHolding");
    const closeHoldingDialogBtn = document.getElementById("closeHoldingDialogBtn");
    const holdingForm = document.getElementById("holdingForm");

    if (btnOpenAddHolding) btnOpenAddHolding.addEventListener("click", () => {
        document.getElementById("holdingSymbol").value = "";
        document.getElementById("holdingQty").value = "";
        document.getElementById("holdingBuyPrice").value = "";
        document.getElementById("holdingTP").value = "";
        document.getElementById("holdingSL").value = "";
        document.getElementById("holdingNotes").value = "";
        holdingDialog.showModal();
    });

    if (closeHoldingDialogBtn) closeHoldingDialogBtn.addEventListener("click", () => holdingDialog.close());

    if (holdingForm) {
        holdingForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const symbol = document.getElementById("holdingSymbol").value.trim().toUpperCase();
            const shares = parseInt(document.getElementById("holdingQty").value, 10);
            const buyPrice = parseFloat(document.getElementById("holdingBuyPrice").value);
            const tp = parseFloat(document.getElementById("holdingTP").value) || null;
            const sl = parseFloat(document.getElementById("holdingSL").value) || null;
            const setup = document.getElementById("holdingSetup").value;
            const notes = document.getElementById("holdingNotes").value;

            if (symbol && shares > 0 && buyPrice > 0) {
                portfolioHoldings.unshift({
                    id: Date.now(),
                    symbol,
                    shares,
                    buyPrice,
                    tp,
                    sl,
                    setup,
                    notes
                });
                savePortfolio();
                holdingDialog.close();
            }
        });
    }

    // Trade Journal Dialog Elements
    const logTradeDialog = document.getElementById("logTradeDialog");
    const btnOpenLogTrade = document.getElementById("btnOpenLogTrade");
    const closeLogTradeDialogBtn = document.getElementById("closeLogTradeDialogBtn");
    const logTradeForm = document.getElementById("logTradeForm");

    if (btnOpenLogTrade) btnOpenLogTrade.addEventListener("click", () => {
        document.getElementById("tradeSymbol").value = "";
        document.getElementById("tradeQty").value = "";
        document.getElementById("tradeEntryPrice").value = "";
        document.getElementById("tradeTP").value = "";
        document.getElementById("tradeSL").value = "";
        document.getElementById("tradeNotes").value = "";
        document.getElementById("tradeDateInput").value = new Date().toISOString().split("T")[0];
        logTradeDialog.showModal();
    });

    if (closeLogTradeDialogBtn) closeLogTradeDialogBtn.addEventListener("click", () => logTradeDialog.close());

    if (logTradeForm) {
        logTradeForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const symbol = document.getElementById("tradeSymbol").value.trim().toUpperCase();
            const type = document.getElementById("tradeType").value;
            const qty = parseInt(document.getElementById("tradeQty").value, 10);
            const entry = parseFloat(document.getElementById("tradeEntryPrice").value);
            const tp = parseFloat(document.getElementById("tradeTP").value) || null;
            const sl = parseFloat(document.getElementById("tradeSL").value) || null;
            const setup = document.getElementById("tradeSetup").value;
            const date = document.getElementById("tradeDateInput").value;
            const notes = document.getElementById("tradeNotes").value;

            if (symbol && qty > 0 && entry > 0) {
                const stock = stocksData.find(s => s.symbol === symbol);
                const exit = tp || (stock ? stock.ltp : entry);

                tradeJournal.unshift({
                    id: Date.now(),
                    date,
                    symbol,
                    type,
                    qty,
                    entry,
                    exit,
                    tp,
                    sl,
                    setup,
                    notes
                });
                saveJournal();
                logTradeDialog.close();
            }
        });
    }

    // Quick Add Actions from Stock Detail Modal
    document.getElementById("btnQuickAddHolding").addEventListener("click", () => {
        const symbol = document.getElementById("detailSymbol").textContent;
        const stock = stocksData.find(s => s.symbol === symbol);
        document.getElementById("stockDetailDialog").close();
        document.getElementById("holdingSymbol").value = symbol;
        if (stock) {
            document.getElementById("holdingBuyPrice").value = stock.ltp;
            document.getElementById("holdingTP").value = (stock.ltp * 1.15).toFixed(2);
            document.getElementById("holdingSL").value = (stock.ltp * 0.93).toFixed(2);
        }
        document.getElementById("holdingDialog").showModal();
    });

    document.getElementById("btnQuickLogTrade").addEventListener("click", () => {
        const symbol = document.getElementById("detailSymbol").textContent;
        const stock = stocksData.find(s => s.symbol === symbol);
        document.getElementById("stockDetailDialog").close();
        document.getElementById("tradeSymbol").value = symbol;
        if (stock) document.getElementById("tradeEntryPrice").value = stock.ltp;
        document.getElementById("tradeDateInput").value = new Date().toISOString().split("T")[0];
        document.getElementById("logTradeDialog").showModal();
    });

    // Auto-fill price, TP (+15%), SL (-7%) when selecting ticker in Holding dialog
    const holdingSymbolSelect = document.getElementById("holdingSymbol");
    if (holdingSymbolSelect) {
        holdingSymbolSelect.addEventListener("change", (e) => {
            const sym = e.target.value;
            const stock = stocksData.find(s => s.symbol === sym);
            if (stock && stock.ltp) {
                document.getElementById("holdingBuyPrice").value = stock.ltp;
                document.getElementById("holdingTP").value = (stock.ltp * 1.15).toFixed(2);
                document.getElementById("holdingSL").value = (stock.ltp * 0.93).toFixed(2);
            }
        });
    }

    // Auto-fill price in Trade Journal dialog
    const tradeSymbolSelect = document.getElementById("tradeSymbol");
    if (tradeSymbolSelect) {
        tradeSymbolSelect.addEventListener("change", (e) => {
            const sym = e.target.value;
            const stock = stocksData.find(s => s.symbol === sym);
            if (stock && stock.ltp) {
                document.getElementById("tradeEntryPrice").value = stock.ltp;
                document.getElementById("tradeTP").value = (stock.ltp * 1.15).toFixed(2);
                document.getElementById("tradeSL").value = (stock.ltp * 0.93).toFixed(2);
            }
        });
    }
}

// Populate Ticker Dropdown Select Options (uses master list merged with live prices)
function populateTickerDropdowns() {
    const holdingSelect = document.getElementById("holdingSymbol");
    const tradeSelect = document.getElementById("tradeSymbol");

    // Build merged ticker list: master tickers + any live-only tickers
    const livePriceMap = {};
    for (const s of stocksData) {
        livePriceMap[s.symbol] = s;
    }

    // Start with master list
    let mergedSymbols = new Map();
    for (const t of masterTickers) {
        mergedSymbols.set(t.symbol, {
            symbol: t.symbol,
            fullName: t.fullName || "",
            sector: t.sector || "",
            ltp: livePriceMap[t.symbol] ? livePriceMap[t.symbol].ltp : null
        });
    }
    // Add any live tickers not in master
    for (const s of stocksData) {
        if (!mergedSymbols.has(s.symbol)) {
            mergedSymbols.set(s.symbol, {
                symbol: s.symbol,
                fullName: s.fullName || s.sector || "",
                sector: s.sector || "",
                ltp: s.ltp
            });
        }
    }

    const sortedTickers = [...mergedSymbols.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (sortedTickers.length === 0) return;

    const optionsHtml = `<option value="">-- Select Ticker (${sortedTickers.length} NEPSE Scripts) --</option>` +
        sortedTickers.map(s => {
            const ltpStr = s.ltp ? `NPR ${s.ltp.toFixed(2)}` : 'No Price Data';
            const label = s.fullName || s.sector || '';
            return `<option value="${s.symbol}">${s.symbol} - ${label} (${ltpStr})</option>`;
        }).join("");

    if (holdingSelect) {
        const currVal = holdingSelect.value;
        holdingSelect.innerHTML = optionsHtml;
        if (currVal) holdingSelect.value = currVal;
    }

    if (tradeSelect) {
        const currVal = tradeSelect.value;
        tradeSelect.innerHTML = optionsHtml;
        if (currVal) tradeSelect.value = currVal;
    }
}

// Fetch Core Data
async function fetchData() {
    try {
        const timestamp = Date.now();
        const res = await fetch(`data/nepse_today.json?t=${timestamp}`);
        const data = await res.json();

        stocksData = data.stocks || [];
        indicesData = data.indices || [];

        try {
            const resSx = await fetch(`data/systemx_scraped.json?t=${timestamp}`);
            systemxData = await resSx.json();
            if (systemxData.stock_live && systemxData.stock_live.length && (!stocksData || !stocksData.length)) {
                stocksData = systemxData.stock_live;
            }
            if (!indicesData.length && systemxData.indices) {
                indicesData = systemxData.indices;
            }
        } catch (e) {
            console.log("No systemx_scraped.json found");
        }

        document.getElementById("tradeDate").textContent = data.date || new Date().toISOString().split("T")[0];
        document.getElementById("lastUpdatedTime").textContent = data.scraped_at ? `Updated: ${data.scraped_at.split(" ")[1] || data.scraped_at}` : "Updated Live";

        renderSummaryGrid(data);
        renderIndicesGrid();
        populateSectorDropdown();
        populateTickerDropdowns();
        renderStocksTable();
        renderStrategyView();
        renderDalalView();
        renderPortfolioView();
        renderJournalView();
        renderWatchlistView();
        renderFloorsheetView();
        renderHeatbubbleView();
    } catch (err) {
        console.error("Error loading data:", err);
        // Fallback: Trigger live scrape if local file failed to load
        try {
            console.log("Attempting live auto-sync scrape...");
            const resSync = await fetch("/api/scrape");
            const dataSync = await resSync.json();
            if (dataSync.success) {
                setTimeout(fetchData, 1000);
            }
        } catch (syncErr) {
            console.error("Auto-sync error:", syncErr);
        }
    }
}



// Render Summary Cards & Market Breadth
function renderSummaryGrid(data) {
    document.getElementById("summaryTurnover").textContent = formatNPR(data.total_turnover);
    document.getElementById("summaryVolume").textContent = formatNumber(data.total_volume);
    document.getElementById("summaryTradedSecurities").textContent = formatNumber(data.total_traded_companies || stocksData.length);

    const adv = data.advancers || stocksData.filter(s => s.diff > 0).length;
    const dec = data.decliners || stocksData.filter(s => s.diff < 0).length;
    const unc = data.unchanged || stocksData.filter(s => s.diff === 0).length;
    const total = adv + dec + unc || 1;

    document.getElementById("breadthAdvancers").textContent = `${adv} ▲`;
    document.getElementById("breadthUnchanged").textContent = `${unc} =`;
    document.getElementById("breadthDecliners").textContent = `${dec} ▼`;

    document.getElementById("barAdvancers").style.width = `${(adv / total) * 100}%`;
    document.getElementById("barUnchanged").style.width = `${(unc / total) * 100}%`;
    document.getElementById("barDecliners").style.width = `${(dec / total) * 100}%`;
}

// Render Sub-Indices Grid Cards
function renderIndicesGrid() {
    const grid = document.getElementById("indicesGrid");
    if (!grid) return;

    if (!indicesData || indicesData.length === 0) {
        grid.innerHTML = `<div class="loading">No sub-indices data available. Click "Sync Live Data" to refresh.</div>`;
        return;
    }

    grid.innerHTML = indicesData.map(idx => {
        const name = idx.indicesName || idx.name || "";
        const val = idx.value || 0;
        const change = idx.pointChange !== undefined ? idx.pointChange : (idx.change || 0);
        const pct = idx.percentageChange !== undefined ? idx.percentageChange : (idx.diff_percent || 0);
        const isUp = change >= 0;

        return `
            <div class="index-card ${selectedSector === name ? 'active' : ''}" onclick="selectIndexFilter('${name}')">
                <div class="index-name">${name}</div>
                <div class="index-val-group">
                    <span class="index-value">${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    <span class="index-badge ${isUp ? 'up' : 'down'}">
                        ${isUp ? '▲ +' : '▼ '}${Math.abs(pct).toFixed(2)}%
                    </span>
                </div>
            </div>
        `;
    }).join("");
}

function selectIndexFilter(sectorName) {
    if (sectorName === "NEPSE") {
        selectedSector = "all";
    } else {
        selectedSector = selectedSector === sectorName ? "all" : sectorName;
    }
    const select = document.getElementById("sectorFilterSelect");
    if (select) select.value = selectedSector;
    renderIndicesGrid();
    renderStocksTable();
}

// Populate Sector Dropdown
function populateSectorDropdown() {
    const select = document.getElementById("sectorFilterSelect");
    if (!select) return;

    const sectors = new Set(stocksData.map(s => s.sector).filter(Boolean));
    const sortedSectors = Array.from(sectors).sort();

    select.innerHTML = `<option value="all">All Sectors</option>` +
        sortedSectors.map(sec => `<option value="${sec}">${sec}</option>`).join("");
}

// Render All Scrips Table
function renderStocksTable() {
    const tbody = document.getElementById("stocksTableBody");
    if (!tbody) return;

    let filtered = [...stocksData];

    // Helper to calculate % distance from 20 SMA
    const getSmaDiffPct = (s) => {
        if (s.diff_20sma !== undefined && s.diff_20sma !== null) return s.diff_20sma;
        if (s.diff_20dma !== undefined && s.diff_20dma !== null) return s.diff_20dma;
        const sma = s.sma20 || s.dma20;
        if (!sma || !s.ltp) return 0;
        return ((s.ltp - sma) / sma) * 100;
    };

    const getSma = (s) => s.sma20 || s.dma20;

    // Search Filter
    if (searchQuery) {
        filtered = filtered.filter(s =>
            s.symbol.toLowerCase().includes(searchQuery) ||
            (s.fullName && s.fullName.toLowerCase().includes(searchQuery)) ||
            (s.sector && s.sector.toLowerCase().includes(searchQuery))
        );
    }

    // Sector Filter
    if (selectedSector !== "all") {
        filtered = filtered.filter(s => s.sector && s.sector.toLowerCase() === selectedSector.toLowerCase());
    }

    // Tab Filters
    if (currentFilter === "gainers") {
        filtered = filtered.filter(s => s.diff > 0);
    } else if (currentFilter === "losers") {
        filtered = filtered.filter(s => s.diff < 0);
    } else if (currentFilter === "goldencross") {
        const matches = filtered.filter(s => s.is_golden_cross || (s.sma20 && s.sma50 && s.sma20 >= s.sma50));
        filtered = matches.length ? matches : filtered.filter(s => (getSmaDiffPct(s) >= 0));
    } else if (currentFilter === "rsi_oversold") {
        const matches = filtered.filter(s => s.rsi14 !== undefined && s.rsi14 !== null && (s.is_rsi_oversold || s.rsi14 <= 45.0));
        filtered = matches.length ? matches : filtered.filter(s => s.rsi14 !== undefined && s.rsi14 !== null);
    } else if (currentFilter === "rsi_overbought") {
        const matches = filtered.filter(s => s.rsi14 !== undefined && s.rsi14 !== null && (s.is_rsi_overbought || s.rsi14 >= 55.0));
        filtered = matches.length ? matches : filtered.filter(s => s.rsi14 !== undefined && s.rsi14 !== null);
    } else if (currentFilter === "vol_surge") {
        const matches = filtered.filter(s => s.volume_surge !== undefined && (s.is_volume_surge || s.volume_surge >= 1.2));
        filtered = matches.length ? matches : filtered.filter(s => (s.volume || 0) > 0);
    } else if (currentFilter === "below20sma" || currentFilter === "below20dma") {
        filtered = filtered.filter(s => {
            const sma = getSma(s);
            return sma && sma > 0 && s.ltp < sma;
        });
    } else if (currentFilter === "above20sma" || currentFilter === "above20dma") {
        filtered = filtered.filter(s => {
            const sma = getSma(s);
            return sma && sma > 0 && s.ltp >= sma;
        });
    } else if (currentFilter === "breakouts") {
        const matches = filtered.filter(s => {
            if (s.is_52w_breakout) return true;
            const h52 = s.fifty_two_week_high || s.high;
            if (!h52 || h52 === 0) return false;
            return (s.ltp / h52) >= 0.90;
        });
        filtered = matches.length ? matches : filtered.filter(s => s.diff_percent > 0);
    }

    // Sorting
    if (sortColumn === "default" || !sortColumn) {
        if (currentFilter === "ema_fractal_sweep") {
            filtered.sort((a, b) => (b.is_ema_fractal_match ? 1 : 0) - (a.is_ema_fractal_match ? 1 : 0) || (b.diff_percent - a.diff_percent));
        } else if (currentFilter === "goldencross") {
            filtered.sort((a, b) => (b.diff_20sma || 0) - (a.diff_20sma || 0));
        } else if (currentFilter === "rsi_oversold") {
            filtered.sort((a, b) => (a.rsi14 || 50) - (b.rsi14 || 50));
        } else if (currentFilter === "rsi_overbought") {
            filtered.sort((a, b) => (b.rsi14 || 50) - (a.rsi14 || 50));
        } else if (currentFilter === "vol_surge") {
            filtered.sort((a, b) => (b.volume_surge || 0) - (a.volume_surge || 0));
        } else if (currentFilter === "below20sma" || currentFilter === "below20dma") {
            filtered.sort((a, b) => getSmaDiffPct(a) - getSmaDiffPct(b));
        } else if (currentFilter === "above20sma" || currentFilter === "above20dma") {
            filtered.sort((a, b) => getSmaDiffPct(b) - getSmaDiffPct(a));
        } else if (currentFilter === "gainers") {
            filtered.sort((a, b) => b.diff_percent - a.diff_percent);
        } else if (currentFilter === "losers") {
            filtered.sort((a, b) => a.diff_percent - b.diff_percent);
        } else {
            filtered.sort((a, b) => a.symbol.localeCompare(b.symbol));
        }
    } else {
        filtered.sort((a, b) => {
            let valA, valB;
            if (sortColumn === "sma20" || sortColumn === "dma20") {
                valA = getSmaDiffPct(a);
                valB = getSmaDiffPct(b);
            } else {
                valA = a[sortColumn];
                valB = b[sortColumn];
            }

            if (typeof valA === "string") {
                return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            valA = valA || 0;
            valB = valB || 0;
            return sortDirection === "asc" ? valA - valB : valB - valA;
        });
    }

    const totalEntries = filtered.length;
    document.getElementById("resultsCount").textContent = `Showing ${totalEntries} of ${stocksData.length} securities`;

    if (totalEntries === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center loading-placeholder">No matching stock securities found for selected scanner filter.</td></tr>`;
        const pageInfoEl = document.getElementById("pageInfo");
        if (pageInfoEl) pageInfoEl.textContent = `Page 0 of 0`;
        return;
    }

    // Pagination Slicing
    let displayItems = filtered;
    if (rowsPerPage !== "all") {
        const pageSize = parseInt(rowsPerPage, 10);
        const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        const startIdx = (currentPage - 1) * pageSize;
        displayItems = filtered.slice(startIdx, startIdx + pageSize);

        const pageInfoEl = document.getElementById("pageInfo");
        if (pageInfoEl) pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;

        const prevBtn = document.getElementById("prevPageBtn");
        const nextBtn = document.getElementById("nextPageBtn");
        if (prevBtn) prevBtn.disabled = (currentPage === 1);
        if (nextBtn) nextBtn.disabled = (currentPage === totalPages || totalPages === 0);
    } else {
        const pageInfoEl = document.getElementById("pageInfo");
        if (pageInfoEl) pageInfoEl.textContent = `All ${totalEntries} rows`;
        const prevBtn = document.getElementById("prevPageBtn");
        const nextBtn = document.getElementById("nextPageBtn");
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
    }

    tbody.innerHTML = displayItems.map(s => {
        const isUp = s.diff >= 0;
        const pctText = (s.diff_percent >= 0 ? "+" : "") + s.diff_percent.toFixed(2) + "%";

        const sma20 = s.sma20 || s.dma20;
        const smaVal = sma20 ? sma20.toFixed(2) : '-';
        const smaDiff = (sma20 && s.ltp) ? (((s.ltp - sma20) / sma20) * 100) : null;
        let smaCellContent = '-';
        if (smaDiff !== null) {
            const isBelow = smaDiff < 0;
            const badgeClass = isBelow ? 'below' : 'above';
            const badgeText = `${isBelow ? '▼' : '▲'} ${Math.abs(smaDiff).toFixed(1)}%`;
            smaCellContent = `<span class="monospace ${isBelow ? 'text-down' : 'text-up'}">${smaVal}</span> <span class="sma-badge ${badgeClass}">${badgeText}</span>`;
        }

        // RSI 14 Badge
        const rsi = s.rsi14;
        let rsiCell = '<span style="color: var(--text-muted);">—</span>';
        if (rsi !== undefined && rsi !== null) {
            if (rsi <= 35.0) {
                rsiCell = `<span style="background: rgba(16,185,129,0.18); color: #10b981; border: 1px solid rgba(16,185,129,0.3); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-family: monospace;">🟢 ${rsi.toFixed(1)}</span>`;
            } else if (rsi >= 70.0) {
                rsiCell = `<span style="background: rgba(239,68,68,0.18); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-family: monospace;">🔴 ${rsi.toFixed(1)}</span>`;
            } else {
                rsiCell = `<span style="color: var(--text-secondary); font-family: monospace; font-weight: 600;">${rsi.toFixed(1)}</span>`;
            }
        }

        // 50 SMA & Golden Cross
        const sma50 = s.sma50;
        let sma50Cell = '<span style="color: var(--text-muted);">—</span>';
        if (sma50) {
            const isGolden = s.is_golden_cross || (sma20 && sma20 > sma50);
            sma50Cell = `<span class="monospace">${sma50.toFixed(2)}</span> ${isGolden ? '<span style="background: rgba(245,158,11,0.18); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">🌟 GOLDEN</span>' : ''}`;
        }

        const sweepBadge = s.is_ema_fractal_match ? '<span style="background: rgba(99,102,241,0.2); color: #818cf8; border: 1px solid rgba(99,102,241,0.4); padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; margin-left: 6px;">🎯 SWEEP</span>' : '';

        return `
            <tr onclick="openStockDetail('${s.symbol}')" style="cursor: pointer;">
                <td class="font-bold monospace">${s.symbol}${sweepBadge}</td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${s.sector || '-'}</td>
                <td class="text-right font-bold monospace">${s.ltp ? s.ltp.toFixed(2) : '0.00'}</td>
                <td class="text-right monospace ${isUp ? 'text-up' : 'text-down'}">${pctText}</td>
                <td class="text-right">${rsiCell}</td>
                <td class="text-right">${smaCellContent}</td>
                <td class="text-right">${sma50Cell}</td>
                <td class="text-right monospace">${formatNumber(s.volume)}</td>
                <td class="text-right monospace">${formatNPR(s.turnover)}</td>
                <td class="text-center" onclick="event.stopPropagation();">
                    <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem;" onclick="openStockDetail('${s.symbol}')">Inspect</button>
                </td>
            </tr>
        `;
    }).join("");
}

function updateSortIndicators() {
    document.querySelectorAll("#stocksTable th.sortable").forEach(th => {
        const col = th.getAttribute("data-sort");
        const indicator = th.querySelector(".sort-indicator");
        if (col === sortColumn) {
            indicator.textContent = sortDirection === "asc" ? " ▲" : " ▼";
        } else {
            indicator.textContent = "";
        }
    });
}

// Stock Detail Modal Renderer
function openStockDetail(symbol) {
    const s = stocksData.find(st => st.symbol === symbol);
    if (!s) return;

    document.getElementById("detailSymbol").textContent = s.symbol;
    document.getElementById("detailClose").textContent = formatNPR(s.ltp);

    const isUp = s.diff >= 0;
    const diffContainer = document.getElementById("detailPriceChangeContainer");
    diffContainer.className = `detail-price-change ${isUp ? 'text-up' : 'text-down'}`;
    document.getElementById("detailDiff").textContent = (isUp ? "+" : "") + s.diff.toFixed(2);
    document.getElementById("detailDiffPercent").textContent = `(${(isUp ? "+" : "") + s.diff_percent.toFixed(2)}%)`;

    document.getElementById("detailOpen").textContent = s.open ? s.open.toFixed(2) : "-";
    document.getElementById("detailHigh").textContent = s.high ? s.high.toFixed(2) : "-";
    document.getElementById("detailLow").textContent = s.low ? s.low.toFixed(2) : "-";
    document.getElementById("detailPrevClose").textContent = s.prev_close ? s.prev_close.toFixed(2) : "-";
    document.getElementById("detailVolume").textContent = formatNumber(s.volume);
    document.getElementById("detailTurnover").textContent = formatNPR(s.turnover);

    // Technical Indicators (RSI, 20 SMA, 50 SMA, Golden Cross)
    const rsiEl = document.getElementById("detailRSI14");
    if (rsiEl) {
        if (s.rsi14 !== undefined && s.rsi14 !== null) {
            let rsiBadge = `${s.rsi14.toFixed(1)}`;
            if (s.rsi14 <= 35) rsiBadge += ` (🟢 Oversold)`;
            else if (s.rsi14 >= 70) rsiBadge += ` (🔴 Overbought)`;
            else rsiBadge += ` (Neutral)`;
            rsiEl.textContent = rsiBadge;
        } else {
            rsiEl.textContent = "-";
        }
    }

    const smaEl = document.getElementById("detail20SMA") || document.getElementById("detail20DMA");
    const sma50El = document.getElementById("detail50SMA");
    const smaTrendEl = document.getElementById("detail20SMATrend") || document.getElementById("detail20DMATrend");
    const sma20 = s.sma20 || s.dma20;
    const sma50 = s.sma50;

    if (smaEl) smaEl.textContent = sma20 ? `NPR ${sma20.toFixed(2)}` : "-";
    if (sma50El) sma50El.textContent = sma50 ? `NPR ${sma50.toFixed(2)}` : "-";

    if (smaTrendEl) {
        if (sma20 && sma50 && s.ltp) {
            const diff20 = ((s.ltp - sma20) / sma20) * 100;
            const isGolden = s.is_golden_cross || sma20 > sma50;
            let signalText = isGolden ? `<span style="color: #f59e0b; font-weight: 700;">🌟 Golden Cross (20 > 50 SMA)` : `<span style="color: #60a5fa;">📉 Normal Trend`;
            signalText += ` | ${diff20 >= 0 ? '+' : ''}${diff20.toFixed(2)}% vs 20 SMA</span>`;
            smaTrendEl.innerHTML = signalText;
        } else if (sma20 && s.ltp) {
            const diff = ((s.ltp - sma20) / sma20) * 100;
            smaTrendEl.innerHTML = diff < 0 ? `<span style="color: #ef4444; font-weight: 600;">📉 Below 20 SMA (${diff.toFixed(2)}%)</span>` : `<span style="color: #10b981; font-weight: 600;">📈 Above 20 SMA (+${diff.toFixed(2)}%)</span>`;
        } else {
            smaTrendEl.textContent = "-";
        }
    }

    // 52W Bounds & Indicator
    const h52 = s.fifty_two_week_high || (s.high * 1.1) || 0;
    const l52 = s.fifty_two_week_low || (s.low * 0.9) || 0;
    document.getElementById("detail52High").textContent = h52 ? h52.toFixed(2) : "-";
    document.getElementById("detail52Low").textContent = l52 ? l52.toFixed(2) : "-";

    if (h52 > l52 && s.ltp) {
        const pctPosition = Math.min(Math.max(((s.ltp - l52) / (h52 - l52)) * 100, 0), 100);
        document.getElementById("detailRangeIndicator").style.left = `${pctPosition}%`;
    }

    // Pivot Points
    const high = s.high || s.ltp;
    const low = s.low || s.ltp;
    const close = s.ltp;
    const pp = (high + low + close) / 3;
    const r1 = (2 * pp) - low;
    const s1 = (2 * pp) - high;
    const r2 = pp + (high - low);
    const s2 = pp - (high - low);

    document.getElementById("pivotPP").textContent = pp.toFixed(2);
    document.getElementById("pivotR1").textContent = r1.toFixed(2);
    document.getElementById("pivotR2").textContent = r2.toFixed(2);
    document.getElementById("pivotS1").textContent = s1.toFixed(2);
    document.getElementById("pivotS2").textContent = s2.toFixed(2);

    const btnCalc = document.getElementById("btnQuickCalcPosition");
    if (btnCalc) {
        btnCalc.onclick = () => {
            document.getElementById("stockDetailDialog").close();
            openPositionCalcModal(s.symbol, s.ltp);
        };
    }

    document.getElementById("stockDetailDialog").showModal();
}

// Visual TP / SL Range Progress Bar Generator
function renderTPSLVisualBar(entry, tp, sl, ltp) {
    const effectiveTP = tp || (entry * 1.15);
    const effectiveSL = sl || (entry * 0.93);

    const minBound = Math.min(effectiveSL, entry, ltp) * 0.99;
    const maxBound = Math.max(effectiveTP, entry, ltp) * 1.01;
    const range = maxBound - minBound || 1;

    const slPct = Math.min(Math.max(((effectiveSL - minBound) / range) * 100, 3), 97);
    const entryPct = Math.min(Math.max(((entry - minBound) / range) * 100, 3), 97);
    const tpPct = Math.min(Math.max(((effectiveTP - minBound) / range) * 100, 3), 97);
    const ltpPct = Math.min(Math.max(((ltp - minBound) / range) * 100, 3), 97);

    const isProfit = ltp >= entry;
    const isSLHit = ltp <= effectiveSL;
    const isTPHit = ltp >= effectiveTP;

    let dotClass = "neutral";
    if (isTPHit) dotClass = "profit";
    else if (isSLHit) dotClass = "loss";
    else if (isProfit) dotClass = "profit";
    else dotClass = "loss";

    let progressText = "";
    if (ltp >= entry && effectiveTP > entry) {
        const pctTowardsTP = Math.min(Math.round(((ltp - entry) / (effectiveTP - entry)) * 100), 100);
        progressText = `<span style="color: var(--color-up); font-weight:600;">+${pctTowardsTP}% to TP</span>`;
    } else if (ltp < entry && entry > effectiveSL) {
        const pctTowardsSL = Math.min(Math.round(((entry - ltp) / (entry - effectiveSL)) * 100), 100);
        progressText = `<span style="color: var(--color-down); font-weight:600;">-${pctTowardsSL}% to SL</span>`;
    } else {
        progressText = `<span>At Entry</span>`;
    }

    const riskVal = Math.max(entry - effectiveSL, 0.01);
    const rewardVal = Math.max(effectiveTP - entry, 0.01);
    const rrRatio = (rewardVal / riskVal).toFixed(2);

    return `
        <div class="tp-sl-visual-container">
            <div class="tp-sl-bar-track">
                <div class="tp-sl-zone-sl" style="width: ${entryPct}%"></div>
                <div class="tp-sl-zone-tp" style="left: ${entryPct}%; width: ${100 - entryPct}%"></div>
                <div class="tp-sl-marker sl" style="left: ${slPct}%" title="Stop Loss: ${effectiveSL.toFixed(2)}"></div>
                <div class="tp-sl-marker entry" style="left: ${entryPct}%" title="Entry: ${entry.toFixed(2)}"></div>
                <div class="tp-sl-marker tp" style="left: ${tpPct}%" title="Target: ${effectiveTP.toFixed(2)}"></div>
                <div class="tp-sl-dot ${dotClass}" style="left: ${ltpPct}%" title="LTP: ${ltp.toFixed(2)}"></div>
            </div>
            <div class="tp-sl-labels">
                <span style="color: var(--color-down);">SL: ${effectiveSL.toFixed(0)}</span>
                ${progressText}
                <span style="color: var(--color-up);">TP: ${effectiveTP.toFixed(0)}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 3px; text-align: center; font-family: monospace; letter-spacing: 0.02em;">
                Risk:Reward 1:${rrRatio}
            </div>
        </div>
    `;
}

// Render Portfolio View with Integrated Trade Journaling Features
function renderPortfolioView() {
    const tbody = document.getElementById("portfolioTableBody");
    if (!tbody) return;

    let totalInvested = 0;
    let totalCurrent = 0;
    let totalSharesCount = 0;

    const rowsHtml = portfolioHoldings.map((h) => {
        const stock = stocksData.find(s => s.symbol === h.symbol);
        const ltp = stock ? stock.ltp : h.buyPrice;
        const cost = h.shares * h.buyPrice;
        const currentVal = h.shares * ltp;
        const pl = currentVal - cost;
        const plPct = cost > 0 ? (pl / cost) * 100 : 0;

        totalInvested += cost;
        totalCurrent += currentVal;
        totalSharesCount += h.shares;

        const isUp = pl >= 0;
        const isTPHit = h.tp && ltp >= h.tp;
        const isSLHit = h.sl && ltp <= h.sl;

        let tpHitTag = isTPHit ? `<span style="background: rgba(16, 185, 129, 0.25); color: #10b981; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 4px;" class="pulse-indicator">🎯 TP HIT!</span>` : "";
        let slHitTag = isSLHit ? `<span style="background: rgba(239, 68, 68, 0.25); color: #ef4444; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 4px;" class="pulse-indicator">🛑 SL HIT!</span>` : "";

        const tpText = h.tp ? `NPR ${h.tp.toFixed(2)}${tpHitTag}` : "-";
        const slText = h.sl ? `NPR ${h.sl.toFixed(2)}${slHitTag}` : "-";
        const setupTag = h.setup || "Breakout";

        const visualBar = renderTPSLVisualBar(h.buyPrice, h.tp, h.sl, ltp);

        const rowStyle = isUp
            ? "background: rgba(16, 185, 129, 0.07); border-left: 4px solid #10b981;"
            : "background: rgba(239, 68, 68, 0.07); border-left: 4px solid #ef4444;";

        const badgeStyle = isUp
            ? "background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 10px; border-radius: 6px; font-weight: 700; display: inline-block;"
            : "background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 10px; border-radius: 6px; font-weight: 700; display: inline-block;";

        return `
            <tr style="${rowStyle}">
                <td>
                    <div class="font-bold monospace">${h.symbol}</div>
                    <span style="background: rgba(99, 102, 241, 0.15); color: #818cf8; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px;">${setupTag}</span>
                </td>
                <td class="text-right monospace font-bold">${formatNumber(h.shares)}</td>
                <td class="text-right monospace">NPR ${h.buyPrice.toFixed(2)}</td>
                <td class="text-right monospace">
                    <div class="font-bold">NPR ${ltp.toFixed(2)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${formatNPR(currentVal)}</div>
                </td>
                <td class="text-right monospace">
                    <span style="${badgeStyle}">
                        <div style="font-size: 0.88rem;">${(isUp ? '📈 +' : '📉 ')}${formatNPR(pl)}</div>
                        <div style="font-size: 0.75rem; font-weight: 600;">(${isUp ? '+' : ''}${plPct.toFixed(2)}%)</div>
                    </span>
                </td>
                <td class="text-right monospace" style="font-size: 0.85rem;">
                    <div style="color: var(--color-up);">TP: ${tpText}</div>
                    <div style="color: var(--color-down);">SL: ${slText}</div>
                </td>
                <td>${visualBar}</td>
                <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 200px;">
                    <div style="max-height: 42px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${h.notes || 'No reason provided'}">
                        ${h.notes || '<em>No rationale noted</em>'}
                    </div>
                </td>
                <td class="text-center" style="white-space: nowrap;">
                    <button class="btn btn-primary" style="padding: 2px 8px; font-size: 0.75rem; margin-right: 4px;" onclick="closePositionToJournal(${h.id})">Close & Log</button>
                    <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem; color: var(--color-down);" onclick="deleteHolding(${h.id})">Remove</button>
                </td>
            </tr>
        `;
    }).join("");

    const totalPL = totalCurrent - totalInvested;
    const totalPLPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
    const isUpTotal = totalPL >= 0;

    document.getElementById("portCurrentValue").textContent = formatNPR(totalCurrent);
    document.getElementById("portTotalInvested").textContent = formatNPR(totalInvested);
    document.getElementById("portTotalPL").textContent = (isUpTotal ? '+' : '') + formatNPR(totalPL);
    document.getElementById("portTotalPL").className = `card-value ${isUpTotal ? 'text-up' : 'text-down'}`;
    document.getElementById("portTotalPLPct").textContent = `(${isUpTotal ? '+' : ''}${totalPLPct.toFixed(2)}% Return)`;
    document.getElementById("portTotalPLPct").className = isUpTotal ? 'text-up' : 'text-down';

    document.getElementById("portHoldingsCount").textContent = portfolioHoldings.length;
    document.getElementById("portTotalShares").textContent = formatNumber(totalSharesCount);

    const activeCountBadge = document.getElementById("activeHoldingsCount");
    if (activeCountBadge) activeCountBadge.textContent = portfolioHoldings.length;

    if (portfolioHoldings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center loading-placeholder">No active portfolio positions. Click "Add Position" to log a position with TP, SL, and trade reason!</td></tr>`;
    } else {
        tbody.innerHTML = rowsHtml;
    }

    // Render Realized Trade History Section in Portfolio View
    renderPortfolioRealizedTable();
    initPortfolioSubTabs();
}

// Sub-Tab Switcher for Portfolio View (Active Holdings vs Realized Trades)
function initPortfolioSubTabs() {
    const tabActive = document.getElementById("tabActiveHoldings");
    const tabRealized = document.getElementById("tabRealizedHistory");
    const containerActive = document.getElementById("activeHoldingsContainer");
    const containerRealized = document.getElementById("realizedHistoryContainer");

    if (tabActive && tabRealized && containerActive && containerRealized) {
        tabActive.onclick = () => {
            tabActive.classList.add("active");
            tabRealized.classList.remove("active");
            containerActive.classList.remove("hidden");
            containerRealized.classList.add("hidden");
        };

        tabRealized.onclick = () => {
            tabRealized.classList.add("active");
            tabActive.classList.remove("active");
            containerRealized.classList.remove("hidden");
            containerActive.classList.add("hidden");
        };
    }
}

// Render Realized Closed Trades Table inside Portfolio View
function renderPortfolioRealizedTable() {
    const tbodyRealized = document.getElementById("portfolioRealizedTableBody");
    const countBadge = document.getElementById("realizedTradesCount");

    if (countBadge) {
        countBadge.textContent = tradeJournal.length;
    }

    if (!tbodyRealized) return;

    if (tradeJournal.length === 0) {
        tbodyRealized.innerHTML = `<tr><td colspan="10" class="text-center loading-placeholder">No completed/realized trades logged yet. Click "Close & Log" on any active position to record a realized trade!</td></tr>`;
        return;
    }

    tbodyRealized.innerHTML = tradeJournal.map(t => {
        const isBuy = t.type === "BUY";
        const pl = isBuy ? (t.exit - t.entry) * t.qty : (t.entry - t.exit) * t.qty;
        const isUp = pl >= 0;

        const rowStyle = isUp
            ? "background: rgba(16, 185, 129, 0.07); border-left: 4px solid #10b981;"
            : "background: rgba(239, 68, 68, 0.07); border-left: 4px solid #ef4444;";

        const badgeStyle = isUp
            ? "background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 10px; border-radius: 6px; font-weight: 700; display: inline-block;"
            : "background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 10px; border-radius: 6px; font-weight: 700; display: inline-block;";

        return `
            <tr style="${rowStyle}">
                <td style="font-size: 0.85rem; color: var(--text-muted);">${t.date || '-'}</td>
                <td class="font-bold monospace">${t.symbol}</td>
                <td><span class="index-badge ${isBuy ? 'up' : 'down'}">${t.type}</span></td>
                <td><span style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 500;">${t.setup || 'Breakout'}</span></td>
                <td class="text-right monospace">${formatNumber(t.qty)}</td>
                <td class="text-right monospace">NPR ${t.entry.toFixed(2)}</td>
                <td class="text-right monospace font-bold">NPR ${(t.exit || t.entry).toFixed(2)}</td>
                <td class="text-right monospace">
                    <span style="${badgeStyle}">
                        ${isUp ? '🎯 +' : '🛑 '}${formatNPR(pl)}
                    </span>
                </td>
                <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 220px; overflow: hidden; text-overflow: ellipsis;">${t.notes || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem; color: var(--color-down);" onclick="deleteJournalTrade(${t.id})">Delete</button>
                </td>
            </tr>
        `;
    }).join("");
}




// Close an active holding and record completed trade in the Trading Journal
function closePositionToJournal(id) {
    const h = portfolioHoldings.find(item => item.id === id);
    if (!h) return;

    const stock = stocksData.find(s => s.symbol === h.symbol);
    const currentLtp = stock ? stock.ltp : h.buyPrice;

    const exitPriceInput = prompt(`Close position for ${h.symbol}? Enter Exit Price (LTP = NPR ${currentLtp}):`, currentLtp);
    if (exitPriceInput === null) return;

    const exitPrice = parseFloat(exitPriceInput);
    if (isNaN(exitPrice) || exitPrice <= 0) {
        alert("Invalid exit price.");
        return;
    }

    // Log to Trade Journal
    tradeJournal.unshift({
        id: Date.now(),
        date: new Date().toISOString().split("T")[0],
        symbol: h.symbol,
        type: "BUY",
        qty: h.shares,
        entry: h.buyPrice,
        exit: exitPrice,
        tp: h.tp,
        sl: h.sl,
        setup: h.setup || "Breakout",
        notes: h.notes || "Position closed & logged from Portfolio."
    });

    // Remove from active portfolio holdings
    portfolioHoldings = portfolioHoldings.filter(item => item.id !== id);

    savePortfolio();
    saveJournal();
    alert(`Closed ${h.symbol} position at NPR ${exitPrice.toFixed(2)}! Realized trade logged to Trading Journal.`);
}

function deleteHolding(id) {
    if (confirm("Are you sure you want to remove this holding?")) {
        portfolioHoldings = portfolioHoldings.filter(h => h.id !== id);
        savePortfolio();
    }
}

// Render Trading Journal View
function renderJournalView() {
    const tbody = document.getElementById("journalTableBody");
    if (!tbody) return;

    let wins = 0;
    let losses = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;

    const rowsHtml = tradeJournal.map(t => {
        const isBuy = t.type === "BUY";
        const pl = isBuy ? (t.exit - t.entry) * t.qty : (t.entry - t.exit) * t.qty;
        const isUp = pl >= 0;

        if (pl > 0) { wins++; totalWinAmount += pl; }
        else if (pl < 0) { losses++; totalLossAmount += Math.abs(pl); }

        const rowStyle = isUp
            ? "background: rgba(16, 185, 129, 0.07); border-left: 4px solid #10b981;"
            : "background: rgba(239, 68, 68, 0.07); border-left: 4px solid #ef4444;";

        const badgeStyle = isUp
            ? "background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 10px; border-radius: 6px; font-weight: 700; display: inline-block;"
            : "background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 10px; border-radius: 6px; font-weight: 700; display: inline-block;";

        return `
            <tr style="${rowStyle}">
                <td style="font-size: 0.85rem; color: var(--text-muted);">${t.date || '-'}</td>
                <td class="font-bold monospace">${t.symbol}</td>
                <td><span class="index-badge ${isBuy ? 'up' : 'down'}">${t.type}</span></td>
                <td><span style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 500;">${t.setup || 'Breakout'}</span></td>
                <td class="text-right monospace">${formatNumber(t.qty)}</td>
                <td class="text-right monospace">NPR ${t.entry.toFixed(2)}</td>
                <td class="text-right monospace">NPR ${(t.exit || t.entry).toFixed(2)}</td>
                <td class="text-right monospace">${t.sl ? 'NPR ' + t.sl.toFixed(2) : '-'}</td>
                <td class="text-right monospace">
                    <span style="${badgeStyle}">
                        ${isUp ? '🎯 +' : '🛑 '}${formatNPR(pl)}
                    </span>
                </td>
                <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${t.notes || '-'}</td>
                <td class="text-center">
                    <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem; color: var(--color-down);" onclick="deleteJournalTrade(${t.id})">Delete</button>
                </td>
            </tr>
        `;
    }).join("");

    const totalTrades = tradeJournal.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const netProfit = totalWinAmount - totalLossAmount;
    const profitFactor = totalLossAmount > 0 ? (totalWinAmount / totalLossAmount).toFixed(2) : totalWinAmount > 0 ? "MAX" : "0.0";

    document.getElementById("journalWinRate").textContent = `${winRate.toFixed(1)}%`;
    document.getElementById("journalWins").textContent = `${wins} Wins`;
    document.getElementById("journalLosses").textContent = `${losses} Losses`;
    document.getElementById("journalNetProfit").textContent = (netProfit >= 0 ? '+' : '') + formatNPR(netProfit);
    document.getElementById("journalNetProfit").className = `card-value ${netProfit >= 0 ? 'text-up' : 'text-down'}`;
    document.getElementById("journalTotalTrades").textContent = totalTrades;
    document.getElementById("journalProfitFactor").textContent = profitFactor;

    if (tradeJournal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center loading-placeholder">No trades logged in your journal yet. Click "Log Trade" to record your setup!</td></tr>`;
    } else {
        tbody.innerHTML = rowsHtml;
    }
}

function deleteJournalTrade(id) {
    if (confirm("Are you sure you want to delete this trade log?")) {
        tradeJournal = tradeJournal.filter(t => t.id !== id);
        saveJournal();
    }
}

// Render Dalal Street Signals View
function renderDalalView() {
    const accumContainer = document.getElementById("jasoosAccumulationContainer");
    const distContainer = document.getElementById("jasoosDistributionContainer");
    const moversContainer = document.getElementById("moversContainer");
    const popularContainer = document.getElementById("popularContainer");
    const leadersContainer = document.getElementById("leadersContainer");

    const jasoos = systemxData.floorsheet_jasoos || {};
    const movers = systemxData.last_min_movers || [];
    const popular = systemxData.popular_stocks || {};
    const perf = systemxData.performance_metrics || {};

    const ride = jasoos.timeForRideValues || {};
    const buys = ride.consistentBuyTickers || [];
    const sudden = ride.suddenInterestTickers || [];
    const holdings = ride.percentageHoldingTickers || [];

    const topi = jasoos.topiTimeValues || {};
    const sells = topi.consistentSellTickers || [];
    const inMoney = topi.brokerInMoneyTickers || [];

    // Update Summary Ribbon Metric Cards
    const buyCountEl = document.getElementById("dalalBuyCount");
    if (buyCountEl) buyCountEl.textContent = `${buys.length} Scrips`;

    const sellCountEl = document.getElementById("dalalSellCount");
    if (sellCountEl) sellCountEl.textContent = `${sells.length} Scrips`;

    const moversCountEl = document.getElementById("dalalMoversCount");
    if (moversCountEl) moversCountEl.textContent = `${movers.length} Scrips`;

    const popularSectorEl = document.getElementById("dalalPopularSector");
    if (popularSectorEl && popular.popularSectors && popular.popularSectors.length) {
        popularSectorEl.textContent = popular.popularSectors[0].sector || "Hydro Power";
    }

    // Bind Refresh Signals Button
    const refreshBtn = document.getElementById("btnRefreshDalalSignals");
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `<span class="btn-icon">⏳</span> Syncing...`;
            try {
                await fetch("/api/scrape");
                await fetchData();
                alert("🎉 Dalal Street Signals refreshed with live NP Stocks floorsheet data!");
            } catch (e) {
                alert("Failed to refresh Dalal signals.");
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = `<span class="btn-icon">🔄</span> Refresh Signals`;
            }
        };
    }

    // Helper: Find stock object from stocksData
    const findStock = (sym) => stocksData.find(s => s.symbol.toUpperCase() === sym.toUpperCase()) || { symbol: sym };

    // 1. Time for Ride (Bullish Accumulation)
    if (accumContainer) {
        accumContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <h5 style="color: #10b981; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin: 0;">
                            🟢 Consistent Institutional Buying (${buys.length})
                        </h5>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Smart Money Accumulation</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${buys.length ? buys.map(b => {
                            const st = findStock(b);
                            const ltp = st.ltp ? st.ltp.toFixed(2) : '-';
                            const diff = st.diff_percent ? (st.diff_percent >= 0 ? '+' : '') + st.diff_percent.toFixed(2) + '%' : '';
                            const isUp = (st.diff_percent || 0) >= 0;
                            return `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-card); border-radius: 8px; border: 1px solid rgba(16,185,129,0.25); cursor: pointer;" onclick="openStockDetail('${b}')">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="font-bold monospace" style="color: #ffffff; font-size: 0.95rem;">${b}</span>
                                        <span style="font-size: 0.75rem; color: var(--text-muted);">${st.sector || 'Security'}</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div class="text-right">
                                            <span class="font-bold monospace" style="font-size: 0.88rem;">NPR ${ltp}</span>
                                            ${diff ? `<span style="font-size: 0.78rem; font-weight: 700; margin-left: 6px;" class="${isUp ? 'text-up' : 'text-down'}">${diff}</span>` : ''}
                                        </div>
                                        <button class="btn btn-primary" style="padding: 2px 8px; font-size: 0.72rem;" onclick="event.stopPropagation(); openPositionCalcModal('${b}', ${st.ltp || 0})">
                                            🧮 Sizing
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join("") : '<div style="color: var(--text-muted); font-size: 0.85rem;">No consistent buy signals detected</div>'}
                    </div>
                </div>

                ${sudden.length ? `
                <div>
                    <h5 style="color: #60a5fa; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-bottom: 8px;">
                        ⚡ Sudden Volume Interest Spikes (${sudden.length})
                    </h5>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${sudden.map(s => `<span class="index-badge" style="background: rgba(59,130,246,0.18); color:#60a5fa; cursor:pointer;" onclick="openStockDetail('${s}')" title="Click for details">${s}</span>`).join("")}
                    </div>
                </div>
                ` : ''}

                ${holdings.length ? `
                <div>
                    <h5 style="color: #a78bfa; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-bottom: 8px;">
                        📊 Top Broker Holdings Concentration (${holdings.length})
                    </h5>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${holdings.map(h => `<span class="index-badge" style="background: rgba(167,139,250,0.18); color:#a78bfa; cursor:pointer;" onclick="openStockDetail('${h}')" title="Click for details">${h}</span>`).join("")}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    // 2. Topi Time (Bearish Distribution & Sell Warnings)
    if (distContainer) {
        distContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <h5 style="color: #ef4444; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin: 0;">
                            🔴 Institutional Distribution / Dumping (${sells.length})
                        </h5>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Big Broker Selling</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${sells.length ? sells.map(s => {
                            const st = findStock(s);
                            const ltp = st.ltp ? st.ltp.toFixed(2) : '-';
                            const diff = st.diff_percent ? (st.diff_percent >= 0 ? '+' : '') + st.diff_percent.toFixed(2) + '%' : '';
                            const isUp = (st.diff_percent || 0) >= 0;
                            return `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-card); border-radius: 8px; border: 1px solid rgba(239,68,68,0.25); cursor: pointer;" onclick="openStockDetail('${s}')">
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="font-bold monospace" style="color: #ffffff; font-size: 0.95rem;">${s}</span>
                                        <span style="font-size: 0.75rem; color: var(--text-muted);">${st.sector || 'Security'}</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div class="text-right">
                                            <span class="font-bold monospace" style="font-size: 0.88rem;">NPR ${ltp}</span>
                                            ${diff ? `<span style="font-size: 0.78rem; font-weight: 700; margin-left: 6px;" class="${isUp ? 'text-up' : 'text-down'}">${diff}</span>` : ''}
                                        </div>
                                        <span style="background: rgba(239,68,68,0.18); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">
                                            ⚠️ SELL
                                        </span>
                                    </div>
                                </div>
                            `;
                        }).join("") : '<div style="color: var(--text-muted); font-size: 0.85rem;">No institutional dumping warnings detected</div>'}
                    </div>
                </div>

                ${inMoney.length ? `
                <div>
                    <h5 style="color: #f59e0b; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-bottom: 8px;">
                        💰 Broker Profit Taking / In Money (${inMoney.length})
                    </h5>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${inMoney.map(m => `<span class="index-badge" style="background: rgba(245,158,11,0.18); color:#f59e0b; cursor:pointer;" onclick="openStockDetail('${m}')" title="Click for details">${m}</span>`).join("")}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    // 3. 15-Min Power Spike Movers
    if (moversContainer) {
        if (movers.length > 0) {
            moversContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px;">
                    ${movers.map(m => {
                        const pctGain = ((m.percentageChangeInLastFifteenMin || 0) * 100).toFixed(2);
                        const volPct = ((m.percentageTotalVolInLastFifteen || 0) * 100).toFixed(1);
                        return `
                        <div style="background: var(--bg-card); padding: 14px; border-radius: 8px; border: 1px solid rgba(245,158,11,0.3); cursor: pointer;" onclick="openStockDetail('${m.ticker}')">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span class="font-bold monospace" style="color: #f59e0b; font-size: 1rem;">${m.ticker}</span>
                                <span style="background: rgba(245,158,11,0.2); color: #f59e0b; padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">+${pctGain}% 15m</span>
                            </div>
                            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 8px;">15m Vol: <strong>${formatNumber(m.volumeInFifteenMin)}</strong> (${volPct}% of day)</div>
                        </div>
                    `;}).join("")}
                </div>
            `;
        } else {
            moversContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No 15-minute power movers detected in current session.</p>`;
        }
    }

    // 4. Retail Interest & Sector Flow
    if (popularContainer) {
        const topB = popular.topBought || {};
        const topS = popular.topSold || {};
        const sectors = popular.popularSectors || [];

        const bKeys = Object.keys(topB);
        const sKeys = Object.keys(topS);

        popularContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 14px;">
                ${sectors.length ? `
                <div>
                    <h5 style="color: #818cf8; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-bottom: 6px;">
                        🔥 Top Turnover Retail Magnet Sector
                    </h5>
                    <div style="padding: 10px 14px; background: var(--bg-card); border-radius: 8px; border: 1px solid rgba(99,102,241,0.3); display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <div style="font-weight: 800; font-size: 0.95rem; color: #ffffff;">${sectors[0].sector}</div>
                            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">Popular Scrips: ${sectors[0].topTickerList}</div>
                        </div>
                        <div class="font-bold monospace" style="color: #10b981; font-size: 0.9rem;">${formatNPR(sectors[0].quantity)}</div>
                    </div>
                </div>
                ` : ''}

                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                    <div>
                        <h5 style="color: #10b981; font-size: 0.78rem; font-weight: 700; margin-bottom: 6px;">Top Retail Buy Interest</h5>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${bKeys.map(k => `<span class="index-badge up" style="cursor:pointer;" onclick="openStockDetail('${k}')">${k} (${topB[k]})</span>`).join("")}
                        </div>
                    </div>
                    <div>
                        <h5 style="color: #ef4444; font-size: 0.78rem; font-weight: 700; margin-bottom: 6px;">Top Retail Sell Interest</h5>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${sKeys.map(k => `<span class="index-badge down" style="cursor:pointer;" onclick="openStockDetail('${k}')">${k} (${topS[k]})</span>`).join("")}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 5. Market Leaders (Turnover & Volume)
    if (leadersContainer) {
        const topTurnover = perf.topTurnover || stocksData.slice().sort((a, b) => b.turnover - a.turnover).slice(0, 5);
        if (topTurnover.length > 0) {
            leadersContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;">
                    ${topTurnover.slice(0, 6).map((s, idx) => `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color); cursor: pointer;" onclick="openStockDetail('${s.symbol}')">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-weight: 800; font-size: 0.85rem; color: #818cf8; width: 22px;">#${idx + 1}</span>
                                <div>
                                    <div class="font-bold monospace" style="font-size: 0.92rem; color: #ffffff;">${s.symbol}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-muted);">${s.sector || s.fullName || ''}</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold monospace" style="font-size: 0.88rem; color: #10b981;">${formatNPR(s.amount || s.turnover)}</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">LTP: NPR ${(s.ltp || 0).toFixed(2)}</div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            `;
        } else {
            leadersContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No leaderboard data available.</p>`;
        }
    }
}

// ============================================================
// Lock-in Period Expiry Tracker
// ============================================================
let lockinFilter = "upcoming";
let lockinSearchQuery = "";
let lockinCurrentPage = 1;
const LOCKIN_PAGE_SIZE = 20;

function renderLockinView() {
    const rawData = (systemxData.lock_in_periods || []);
    const tbody = document.getElementById("lockinTableBody");
    if (!rawData.length) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center loading-placeholder">No lock-in data available. Click "Sync Live Data" to refresh.</td></tr>`;
        return;
    }

    const now = Date.now();
    const DAY_MS = 1000 * 60 * 60 * 24;

    const MONTH_6_OFFSET = 2.5 * 365.25 * 24 * 3600 * 1000; // 2.5 years before 3-year promoter date

    // Process lock-in records into Promoter 3Y and Mutual Fund 6M Quota entries
    let enriched = [];

    rawData.forEach(item => {
        const stock = stocksData.find(s => s.symbol === item.tickerSymbol);
        const ltp = stock ? stock.ltp : null;
        const ts3Y = item.lockInPeriod || 0;
        const isMFScheme = stock && (stock.sector === "Mutual Fund" || (stock.fullName && (stock.fullName.toLowerCase().includes("fund") || stock.fullName.toLowerCase().includes("yojana"))));

        if (isMFScheme) {
            // Mutual Fund Scheme Lock/Maturity
            const daysLeft = ts3Y ? Math.round((ts3Y - now) / DAY_MS) : null;
            const unlockDate = ts3Y ? new Date(ts3Y).toISOString().split("T")[0] : "—";
            enriched.push({
                ...item,
                category: "mf",
                entityType: "🏛️ Mutual Fund Scheme Lock",
                lockPeriodLabel: "Fund Maturity",
                ts: ts3Y,
                daysLeft,
                unlockDate,
                ltp
            });
        } else {
            // 1. Promoter & Local Shares (3-Year Lock-in)
            const daysLeft3Y = ts3Y ? Math.round((ts3Y - now) / DAY_MS) : null;
            const unlockDate3Y = ts3Y ? new Date(ts3Y).toISOString().split("T")[0] : "—";
            enriched.push({
                ...item,
                category: "promoter",
                entityType: "👔 Promoter & Local Shares",
                lockPeriodLabel: "3 Years",
                ts: ts3Y,
                daysLeft: daysLeft3Y,
                unlockDate: unlockDate3Y,
                ltp
            });

            // 2. Mutual Funds 5% IPO Quota (6-Month Lock-in)
            if (ts3Y) {
                const ts6M = ts3Y - MONTH_6_OFFSET;
                const daysLeft6M = Math.round((ts6M - now) / DAY_MS);
                const unlockDate6M = new Date(ts6M).toISOString().split("T")[0];
                enriched.push({
                    ...item,
                    category: "mf",
                    entityType: "🏛️ Mutual Funds (5% Quota)",
                    lockPeriodLabel: "6 Months",
                    ts: ts6M,
                    daysLeft: daysLeft6M,
                    unlockDate: unlockDate6M,
                    ltp
                });
            }
        }
    });

    // Calculate Summary Counts
    const upcomingRecords = enriched.filter(i => i.daysLeft !== null && i.daysLeft >= 0);
    const next7    = upcomingRecords.filter(i => i.daysLeft <= 7).length;
    const next30   = upcomingRecords.filter(i => i.daysLeft > 7 && i.daysLeft <= 30).length;
    const next90   = upcomingRecords.filter(i => i.daysLeft > 30 && i.daysLeft <= 90).length;
    const unlocked = enriched.filter(i => i.daysLeft !== null && i.daysLeft < 0).length;

    const el = id => document.getElementById(id);
    if (el("lockinNext7"))    el("lockinNext7").textContent    = next7;
    if (el("lockinNext30"))   el("lockinNext30").textContent   = next30;
    if (el("lockinNext90"))   el("lockinNext90").textContent   = next90;
    if (el("lockinUnlocked")) el("lockinUnlocked").textContent = unlocked;

    // Apply Active Filter Tab
    let filtered = enriched;
    if (lockinFilter === "upcoming") {
        filtered = enriched.filter(i => i.daysLeft !== null && i.daysLeft >= 0);
    } else if (lockinFilter === "7") {
        filtered = enriched.filter(i => i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= 7);
    } else if (lockinFilter === "30") {
        filtered = enriched.filter(i => i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= 30);
    } else if (lockinFilter === "promoter") {
        filtered = enriched.filter(i => i.category === "promoter");
    } else if (lockinFilter === "mf") {
        filtered = enriched.filter(i => i.category === "mf");
    } else if (lockinFilter === "unlocked") {
        filtered = enriched.filter(i => i.daysLeft !== null && i.daysLeft < 0);
    }

    // Apply Search Query
    if (lockinSearchQuery) {
        const q = lockinSearchQuery.toLowerCase();
        filtered = filtered.filter(i =>
            i.tickerSymbol.toLowerCase().includes(q) ||
            (i.companyName || "").toLowerCase().includes(q) ||
            i.entityType.toLowerCase().includes(q)
        );
    }

    // Sort: Soonest unlock dates first
    filtered.sort((a, b) => {
        if (a.daysLeft === null) return 1;
        if (b.daysLeft === null) return -1;
        return a.daysLeft - b.daysLeft;
    });

    const totalRecords = filtered.length;

    // Helper functions for Risk Status & Countdown badges
    function riskBadge(daysLeft) {
        if (daysLeft === null) return `<span style="color: var(--text-muted); font-size: 0.8rem;">—</span>`;
        if (daysLeft < 0)    return `<span style="background: rgba(16,185,129,0.15); color: #10b981; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600;">🔓 UNLOCKED</span>`;
        if (daysLeft === 0)  return `<span style="background: rgba(239,68,68,0.25); color: #ef4444; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 800;" class="pulse-indicator">🚨 UNLOCKING TODAY</span>`;
        if (daysLeft <= 7)   return `<span style="background: rgba(239,68,68,0.2); color: #ef4444; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 700;">🚨 CRITICAL RISK</span>`;
        if (daysLeft <= 30)  return `<span style="background: rgba(245,158,11,0.2); color: #f59e0b; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 700;">⚠️ HIGH RISK</span>`;
        if (daysLeft <= 90)  return `<span style="background: rgba(99,102,241,0.2); color: #818cf8; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600;">📅 MEDIUM</span>`;
        return `<span style="background: rgba(16,185,129,0.12); color: #10b981; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem;">✅ LOW RISK</span>`;
    }

    function countdownText(daysLeft) {
        if (daysLeft === null) return `<span style="color: var(--text-muted);">—</span>`;
        if (daysLeft < 0)  return `<span style="color: var(--text-muted); font-size: 0.83rem;">Unlocked ${Math.abs(daysLeft)}d ago</span>`;
        if (daysLeft === 0) return `<span style="color: #ef4444; font-weight: 800;">TODAY!</span>`;
        const color = daysLeft <= 7 ? "#ef4444" : daysLeft <= 30 ? "#f59e0b" : "#818cf8";
        return `<span style="color: ${color}; font-weight: 700; font-size: 0.88rem;">${daysLeft} days left</span>`;
    }

    if (!tbody) return;

    if (!totalRecords) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center loading-placeholder">No matching lock-in records found.</td></tr>`;
        if (el("lockinPageInfo")) el("lockinPageInfo").textContent = "Page 0 of 0";
        if (el("lockinCountInfo")) el("lockinCountInfo").textContent = "Showing 0 records";
        return;
    }

    // Pagination Slicing
    const totalPages = Math.max(1, Math.ceil(totalRecords / LOCKIN_PAGE_SIZE));
    if (lockinCurrentPage > totalPages) lockinCurrentPage = totalPages;
    const startIdx = (lockinCurrentPage - 1) * LOCKIN_PAGE_SIZE;
    const paginatedItems = filtered.slice(startIdx, startIdx + LOCKIN_PAGE_SIZE);

    if (el("lockinPageInfo")) el("lockinPageInfo").textContent = `Page ${lockinCurrentPage} of ${totalPages}`;
    if (el("lockinCountInfo")) el("lockinCountInfo").textContent = `Showing ${startIdx + 1} - ${Math.min(startIdx + LOCKIN_PAGE_SIZE, totalRecords)} of ${totalRecords} records`;

    const prevBtn = el("prevLockinPageBtn");
    const nextBtn = el("nextLockinPageBtn");
    if (prevBtn) prevBtn.disabled = (lockinCurrentPage === 1);
    if (nextBtn) nextBtn.disabled = (lockinCurrentPage === totalPages);

    tbody.innerHTML = paginatedItems.map(item => {
        const isExpired = item.daysLeft !== null && item.daysLeft < 0;
        const rowHighlight = (!isExpired && item.daysLeft !== null && item.daysLeft <= 7) ? 'background: rgba(239,68,68,0.06); border-left: 3px solid #ef4444;' : '';
        const isMF = item.category === "mf";
        const quotaBadge = isMF
            ? `<span style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600;">${item.entityType}</span>`
            : `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 3px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600;">${item.entityType}</span>`;

        return `
        <tr style="${rowHighlight}">
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span class="font-bold monospace" style="cursor:pointer; color: var(--color-accent); font-size: 0.95rem;" onclick="openStockDetail('${item.tickerSymbol}')">${item.tickerSymbol}</span>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.companyName || '—'}</span>
                </div>
            </td>
            <td>${quotaBadge}</td>
            <td class="text-right monospace" style="font-size: 0.88rem; font-weight: 600;">${item.unlockDate}</td>
            <td class="text-center">${countdownText(item.daysLeft)}</td>
            <td class="text-center">${riskBadge(item.daysLeft)}</td>
            <td class="text-right monospace font-bold">
                ${item.ltp ? `NPR ${item.ltp.toFixed(2)}` : '<span style="color: var(--text-muted);">—</span>'}
            </td>
            <td class="text-center">
                <button class="btn btn-secondary" style="padding: 3px 10px; font-size: 0.76rem; border-radius: 6px;" onclick="openStockDetail('${item.tickerSymbol}')">🔍 Inspect</button>
            </td>
        </tr>`;
    }).join("");

    // Bind Filter Tabs
    document.querySelectorAll("[data-lockin-filter]").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll("[data-lockin-filter]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            lockinFilter = btn.getAttribute("data-lockin-filter");
            lockinCurrentPage = 1;
            renderLockinView();
        };
    });

    // Bind Search Input
    const searchEl = document.getElementById("lockinSearch");
    if (searchEl && !searchEl._lockinBound) {
        searchEl._lockinBound = true;
        searchEl.addEventListener("input", e => {
            lockinSearchQuery = e.target.value.trim().toLowerCase();
            lockinCurrentPage = 1;
            renderLockinView();
        });
    }

    // Bind Pagination Buttons
    if (prevBtn && !prevBtn._bound) {
        prevBtn._bound = true;
        prevBtn.onclick = () => {
            if (lockinCurrentPage > 1) {
                lockinCurrentPage--;
                renderLockinView();
            }
        };
    }

    if (nextBtn && !nextBtn._bound) {
        nextBtn._bound = true;
        nextBtn.onclick = () => {
            lockinCurrentPage++;
            renderLockinView();
        };
    }
}


// ============================================================
// Institutional Floorsheet Intelligence (Scrip & Broker Wise)
// ============================================================
let activeFloorsheetTab = "scrip";

function renderFloorsheetView() {
    initFloorsheetView();
    // Auto load default ADBL scrip analysis if not yet loaded
    const tbodyScrip = document.getElementById("floorsheetScripTableBody");
    if (tbodyScrip && tbodyScrip.children.length === 1 && tbodyScrip.children[0].textContent.includes("Select a ticker")) {
        fetchScripFloorsheet("ADBL");
    }
}

function initFloorsheetView() {
    const tabScrip = document.getElementById("tabFloorsheetScrip");
    const tabBroker = document.getElementById("tabFloorsheetBroker");
    const secScrip = document.getElementById("floorsheetScripSection");
    const secBroker = document.getElementById("floorsheetBrokerSection");

    if (tabScrip && tabBroker && secScrip && secBroker) {
        tabScrip.onclick = () => {
            tabScrip.classList.add("active");
            tabBroker.classList.remove("active");
            secScrip.classList.remove("hidden");
            secBroker.classList.add("hidden");
            activeFloorsheetTab = "scrip";
        };
        tabBroker.onclick = () => {
            tabBroker.classList.add("active");
            tabScrip.classList.remove("active");
            secBroker.classList.remove("hidden");
            secScrip.classList.add("hidden");
            activeFloorsheetTab = "broker";
            const topBought = document.getElementById("floorsheetBrokerTopBoughtContainer");
            if (topBought && topBought.textContent.includes("Click \"Analyze Broker Flow\"")) {
                fetchBrokerFloorsheet("58");
            }
        };
    }

    // Populate Scrip Dropdown with master tickers
    const scripSelect = document.getElementById("floorsheetScripSelect");
    if (scripSelect && scripSelect.children.length <= 1) {
        const sorted = masterTickers.length ? [...masterTickers].sort((a, b) => a.symbol.localeCompare(b.symbol)) : stocksData;
        if (sorted.length) {
            scripSelect.innerHTML = sorted.map(s => `<option value="${s.symbol}">${s.symbol} - ${s.fullName || s.sector || ''}</option>`).join("");
        }
    }

    // Bind fetch buttons
    const btnScrip = document.getElementById("btnFetchScripFloorsheet");
    if (btnScrip && !btnScrip._bound) {
        btnScrip._bound = true;
        btnScrip.onclick = () => {
            const sym = document.getElementById("floorsheetScripSelect")?.value || "ADBL";
            fetchScripFloorsheet(sym);
        };
    }

    const btnBroker = document.getElementById("btnFetchBrokerFloorsheet");
    if (btnBroker && !btnBroker._bound) {
        btnBroker._bound = true;
        btnBroker.onclick = () => {
            const customBroker = document.getElementById("floorsheetCustomBrokerInput")?.value.trim();
            const selectBroker = document.getElementById("floorsheetBrokerSelect")?.value || "58";
            const brokerNo = customBroker || selectBroker;
            fetchBrokerFloorsheet(brokerNo);
        };
    }

    // Auto-fetch ADBL floorsheet on first view if table is empty
    const scripTable = document.getElementById("floorsheetScripTableBody");
    if (scripTable && scripTable.children.length <= 1) {
        fetchScripFloorsheet("ADBL");
    }
}

async function fetchScripFloorsheet(symbol) {
    symbol = symbol.toUpperCase();
    const statusEl = document.getElementById("floorsheetScripStatus");
    const tbody = document.getElementById("floorsheetScripTableBody");

    if (statusEl) statusEl.textContent = `Fetching floorsheet for ${symbol}...`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center loading-placeholder">Loading transactions for ${symbol}...</td></tr>`;

    try {
        const res = await fetch(`/api/floorsheet?symbol=${symbol}&length=500`);
        const records = await res.json();

        if (!Array.isArray(records) || records.length === 0) {
            if (statusEl) statusEl.textContent = `No floorsheet records found for ${symbol} today.`;
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center loading-placeholder">No transactions recorded for ${symbol} today.</td></tr>`;
            return;
        }

        if (statusEl) statusEl.textContent = `Loaded ${records.length} transactions for ${symbol}.`;

        // Calculate summary metrics & broker net accumulation
        let totalVol = 0;
        let totalTurnover = 0;
        const brokerBuyMap = {};
        const brokerSellMap = {};

        records.forEach(r => {
            const qty = r.quantity || 0;
            const amt = r.amount || 0;
            const buyer = r.buyer || 'Unknown';
            const seller = r.seller || 'Unknown';

            totalVol += qty;
            totalTurnover += amt;

            if (!brokerBuyMap[buyer]) brokerBuyMap[buyer] = { qty: 0, amt: 0 };
            brokerBuyMap[buyer].qty += qty;
            brokerBuyMap[buyer].amt += amt;

            if (!brokerSellMap[seller]) brokerSellMap[seller] = { qty: 0, amt: 0 };
            brokerSellMap[seller].qty += qty;
            brokerSellMap[seller].amt += amt;
        });

        const avgPrice = totalVol > 0 ? totalTurnover / totalVol : 0;
        const allBrokers = new Set([...Object.keys(brokerBuyMap), ...Object.keys(brokerSellMap)]);

        // Update Summary Cards
        const el = id => document.getElementById(id);
        if (el("floorsheetScripTotalVol")) el("floorsheetScripTotalVol").textContent = formatNumber(totalVol);
        if (el("floorsheetScripTurnover")) el("floorsheetScripTurnover").textContent = formatNPR(totalTurnover);
        if (el("floorsheetScripAvgPrice")) el("floorsheetScripAvgPrice").textContent = `NPR ${avgPrice.toFixed(2)}`;
        if (el("floorsheetScripBrokersCount")) el("floorsheetScripBrokersCount").textContent = `${allBrokers.size} Brokers`;
        if (el("floorsheetScripTxnCount")) el("floorsheetScripTxnCount").textContent = `${records.length} Transactions`;

        // Calculate net position for each broker
        const brokerNet = [];
        allBrokers.forEach(bNo => {
            const bQty = brokerBuyMap[bNo] ? brokerBuyMap[bNo].qty : 0;
            const bAmt = brokerBuyMap[bNo] ? brokerBuyMap[bNo].amt : 0;
            const sQty = brokerSellMap[bNo] ? brokerSellMap[bNo].qty : 0;
            const sAmt = brokerSellMap[bNo] ? brokerSellMap[bNo].amt : 0;

            const netQty = bQty - sQty;
            const netAmt = bAmt - sAmt;

            brokerNet.push({
                broker: bNo,
                bQty, bAmt, sQty, sAmt, netQty, netAmt
            });
        });

        const topBuyers = [...brokerNet].sort((a, b) => b.netQty - a.netQty).filter(b => b.netQty > 0);
        const topSellers = [...brokerNet].sort((a, b) => a.netQty - b.netQty).filter(b => b.netQty < 0);

        if (topBuyers.length && el("floorsheetScripTopBroker")) {
            el("floorsheetScripTopBroker").textContent = `Broker #${topBuyers[0].broker}`;
            if (el("floorsheetScripTopBrokerVol")) el("floorsheetScripTopBrokerVol").textContent = `Net +${formatNumber(topBuyers[0].netQty)} shares (${formatNPR(topBuyers[0].netAmt)})`;
        }

        // Render Buyers Container
        const buyersContainer = document.getElementById("floorsheetScripBuyersContainer");
        if (buyersContainer) {
            buyersContainer.innerHTML = topBuyers.slice(0, 6).map((b, idx) => {
                const pct = totalVol > 0 ? ((b.bQty / totalVol) * 100).toFixed(1) : 0;
                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2); border-radius: 6px; margin-bottom: 6px;">
                    <div>
                        <span class="font-bold monospace" style="color: #10b981;">Broker #${b.broker}</span>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">Bought ${formatNumber(b.bQty)} shares (${pct}% of vol)</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold monospace" style="color: #10b981; font-size: 0.85rem;">+${formatNumber(b.netQty)} net</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${formatNPR(b.netAmt)}</div>
                    </div>
                </div>`;
            }).join("") || `<p style="color: var(--text-muted); font-size: 0.85rem;">No net buyers found.</p>`;
        }

        // Render Sellers Container
        const sellersContainer = document.getElementById("floorsheetScripSellersContainer");
        if (sellersContainer) {
            sellersContainer.innerHTML = topSellers.slice(0, 6).map((b, idx) => {
                const pct = totalVol > 0 ? ((b.sQty / totalVol) * 100).toFixed(1) : 0;
                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 6px; margin-bottom: 6px;">
                    <div>
                        <span class="font-bold monospace" style="color: #ef4444;">Broker #${b.broker}</span>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">Sold ${formatNumber(b.sQty)} shares (${pct}% of vol)</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold monospace" style="color: #ef4444; font-size: 0.85rem;">${formatNumber(b.netQty)} net</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${formatNPR(Math.abs(b.netAmt))}</div>
                    </div>
                </div>`;
            }).join("") || `<p style="color: var(--text-muted); font-size: 0.85rem;">No net sellers found.</p>`;
        }

        // Render Transaction Log Table
        const countEl = document.getElementById("floorsheetScripTableCount");
        if (countEl) countEl.textContent = `Showing ${records.length} transactions for ${symbol}`;

        if (tbody) {
            tbody.innerHTML = records.map((r, idx) => `
                <tr>
                    <td style="font-size: 0.82rem; color: var(--text-muted);">${r.sn || idx + 1}</td>
                    <td class="font-bold monospace" style="color: var(--color-accent);">${r.symbol}</td>
                    <td class="text-center font-bold monospace" style="color: #10b981; background: rgba(16,185,129,0.08); border-radius: 4px;">Broker #${r.buyer}</td>
                    <td class="text-center font-bold monospace" style="color: #ef4444; background: rgba(239,68,68,0.08); border-radius: 4px;">Broker #${r.seller}</td>
                    <td class="text-right monospace font-bold">${formatNumber(r.quantity)}</td>
                    <td class="text-right monospace">NPR ${(r.rate || 0).toFixed(2)}</td>
                    <td class="text-right monospace font-bold">${formatNPR(r.amount)}</td>
                </tr>
            `).join("");
        }

    } catch (err) {
        console.error("Floorsheet scrip fetch error:", err);
        if (statusEl) statusEl.textContent = `Error loading floorsheet for ${symbol}.`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center loading-placeholder">Failed to fetch floorsheet data.</td></tr>`;
    }
}

async function fetchBrokerFloorsheet(brokerNo) {
    brokerNo = String(brokerNo).replace("#", "").trim();
    const statusEl = document.getElementById("floorsheetBrokerStatus");
    if (statusEl) statusEl.textContent = `Analyzing trading flow across active NEPSE stocks for Broker #${brokerNo}...`;

    try {
        // Fetch floorsheet records across top active stocks
        const topSymbols = (stocksData.length ? stocksData.slice(0, 15) : masterTickers.slice(0, 15)).map(s => s.symbol);
        const fetchPromises = topSymbols.map(sym => fetch(`/api/floorsheet?symbol=${sym}&length=200`).then(r => r.json()).catch(() => []));
        const results = await Promise.all(fetchPromises);

        const allRecords = results.flat().filter(r => r && typeof r === 'object');
        const buys = allRecords.filter(r => String(r.buyer) === String(brokerNo));
        const sells = allRecords.filter(r => String(r.seller) === String(brokerNo));

        let totalBuyVol = 0, totalBuyAmt = 0;
        let totalSellVol = 0, totalSellAmt = 0;

        const stockBuyMap = {};
        const stockSellMap = {};

        buys.forEach(r => {
            const sym = r.symbol || "UNKNOWN";
            const qty = r.quantity || 0;
            const amt = r.amount || 0;
            totalBuyVol += qty;
            totalBuyAmt += amt;
            if (!stockBuyMap[sym]) stockBuyMap[sym] = { qty: 0, amt: 0 };
            stockBuyMap[sym].qty += qty;
            stockBuyMap[sym].amt += amt;
        });

        sells.forEach(r => {
            const sym = r.symbol || "UNKNOWN";
            const qty = r.quantity || 0;
            const amt = r.amount || 0;
            totalSellVol += qty;
            totalSellAmt += amt;
            if (!stockSellMap[sym]) stockSellMap[sym] = { qty: 0, amt: 0 };
            stockSellMap[sym].qty += qty;
            stockSellMap[sym].amt += amt;
        });

        const totalTurnover = totalBuyAmt + totalSellAmt;
        const totalTrades = buys.length + sells.length;
        const netVol = totalBuyVol - totalSellVol;
        const netAmt = totalBuyAmt - totalSellAmt;
        const isNetBuyer = netVol >= 0;

        // Update Summary Cards
        const el = id => document.getElementById(id);
        if (el("floorsheetBrokerTurnover")) el("floorsheetBrokerTurnover").textContent = formatNPR(totalTurnover);
        if (el("floorsheetBrokerTxnCount")) el("floorsheetBrokerTxnCount").textContent = `${totalTrades} Total Trades (${buys.length} Buy / ${sells.length} Sell)`;
        if (el("floorsheetBrokerBuyVol")) el("floorsheetBrokerBuyVol").textContent = formatNumber(totalBuyVol);
        if (el("floorsheetBrokerBuyAmount")) el("floorsheetBrokerBuyAmount").textContent = formatNPR(totalBuyAmt);
        if (el("floorsheetBrokerSellVol")) el("floorsheetBrokerSellVol").textContent = formatNumber(totalSellVol);
        if (el("floorsheetBrokerSellAmount")) el("floorsheetBrokerSellAmount").textContent = formatNPR(totalSellAmt);

        if (el("floorsheetBrokerNetFlow")) {
            el("floorsheetBrokerNetFlow").textContent = `${isNetBuyer ? '+' : ''}${formatNumber(netVol)} shares`;
            el("floorsheetBrokerNetFlow").className = `card-value ${isNetBuyer ? 'text-up' : 'text-down'}`;
        }
        if (el("floorsheetBrokerNetLabel")) {
            el("floorsheetBrokerNetLabel").textContent = `${isNetBuyer ? 'Net Accumulation' : 'Net Distribution'} (${formatNPR(netAmt)})`;
        }

        if (statusEl) statusEl.textContent = `Loaded ${totalTrades} trades for Broker #${brokerNo}.`;

        // Render Top Stocks Bought Container
        const topBoughtContainer = document.getElementById("floorsheetBrokerTopBoughtContainer");
        const topBoughtList = Object.entries(stockBuyMap).map(([sym, data]) => ({ symbol: sym, ...data })).sort((a, b) => b.amt - a.amt);

        if (topBoughtContainer) {
            topBoughtContainer.innerHTML = topBoughtList.slice(0, 8).map(s => {
                const avg = s.qty > 0 ? s.amt / s.qty : 0;
                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.2); border-radius: 6px; margin-bottom: 6px; cursor: pointer;" onclick="openStockDetail('${s.symbol}')">
                    <div>
                        <span class="font-bold monospace" style="color: #10b981;">${s.symbol}</span>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">Avg: NPR ${avg.toFixed(2)}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold monospace" style="color: #10b981; font-size: 0.85rem;">+${formatNumber(s.qty)} shares</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${formatNPR(s.amt)}</div>
                    </div>
                </div>`;
            }).join("") || `<p style="color: var(--text-muted); font-size: 0.85rem;">No stock purchases recorded for Broker #${brokerNo} today.</p>`;
        }

        // Render Top Stocks Sold Container
        const topSoldContainer = document.getElementById("floorsheetBrokerTopSoldContainer");
        const topSoldList = Object.entries(stockSellMap).map(([sym, data]) => ({ symbol: sym, ...data })).sort((a, b) => b.amt - a.amt);

        if (topSoldContainer) {
            topSoldContainer.innerHTML = topSoldList.slice(0, 8).map(s => {
                const avg = s.qty > 0 ? s.amt / s.qty : 0;
                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 6px; margin-bottom: 6px; cursor: pointer;" onclick="openStockDetail('${s.symbol}')">
                    <div>
                        <span class="font-bold monospace" style="color: #ef4444;">${s.symbol}</span>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">Avg: NPR ${avg.toFixed(2)}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold monospace" style="color: #ef4444; font-size: 0.85rem;">-${formatNumber(s.qty)} shares</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${formatNPR(s.amt)}</div>
                    </div>
                </div>`;
            }).join("") || `<p style="color: var(--text-muted); font-size: 0.85rem;">No stock sales recorded for Broker #${brokerNo} today.</p>`;
        }

    } catch (err) {
        console.error("Broker floorsheet fetch error:", err);
        if (statusEl) statusEl.textContent = `Error loading trading flow for Broker #${brokerNo}.`;
    }
}


// ============================================================
// Real-Time Watchlist & Price Alerts Engine
// ============================================================
let customWatchlist = [];

function loadWatchlist() {
    const saved = localStorage.getItem("nepse_watchlist_v3");
    if (saved) {
        try { customWatchlist = JSON.parse(saved); } catch(e) {}
    }
    if (!Array.isArray(customWatchlist) || customWatchlist.length === 0) {
        // Default sample watchlist items
        customWatchlist = [
            { id: 1, symbol: "ADBL", highTarget: 340, lowTarget: 300, notes: "Breakout resistance watch at 340" },
            { id: 2, symbol: "NABIL", highTarget: 560, lowTarget: 510, notes: "Accumulation near 510 support" }
        ];
        saveWatchlist();
    }
}

function saveWatchlist() {
    localStorage.setItem("nepse_watchlist_v3", JSON.stringify(customWatchlist));
    renderWatchlistView();
}

function checkPortfolioTPSLAlerts() {
    if (!portfolioHoldings.length || !stocksData.length) return;

    let updated = false;

    portfolioHoldings.forEach(h => {
        const stock = stocksData.find(s => s.symbol === h.symbol);
        if (!stock || !stock.ltp) return;
        const ltp = stock.ltp;

        // Check TP Hit
        if (h.tp && ltp >= h.tp && !h.tpAlertTriggered) {
            h.tpAlertTriggered = true;
            updated = true;
            const msg = `🎯 TAKE PROFIT TARGET HIT!\n\nYour active portfolio holding for ${h.symbol} has reached your Take Profit target:\n• Entry Price: NPR ${h.buyPrice.toFixed(2)}\n• TP Target: NPR ${h.tp.toFixed(2)}\n• Current Live Price: NPR ${ltp.toFixed(2)}\n\nConsider closing & logging your trade to lock in profit!`;
            playAlertSound();
            setTimeout(() => alert(msg), 100);
        }

        // Check SL Hit
        if (h.sl && ltp <= h.sl && !h.slAlertTriggered) {
            h.slAlertTriggered = true;
            updated = true;
            const msg = `🛑 STOP LOSS LEVEL BREACHED!\n\nYour active portfolio holding for ${h.symbol} has breached your Stop Loss limit:\n• Entry Price: NPR ${h.buyPrice.toFixed(2)}\n• SL Limit: NPR ${h.sl.toFixed(2)}\n• Current Live Price: NPR ${ltp.toFixed(2)}\n\nReview your position to manage portfolio risk!`;
            playAlertSound();
            setTimeout(() => alert(msg), 100);
        }
    });

    if (updated) {
        savePortfolio();
    }
}

function checkPriceAlerts() {
    if (!customWatchlist.length || !stocksData.length) return;

    let hasNewTriggers = false;

    customWatchlist.forEach(w => {
        const stock = stocksData.find(s => s.symbol === w.symbol);
        if (!stock || !stock.ltp) return;
        const ltp = stock.ltp;
        let triggered = false;
        let alertMessage = "";

        if (w.highTarget && ltp >= w.highTarget) {
            triggered = true;
            alertMessage = `🚀 BREAKOUT ALERT: ${w.symbol} LTP (NPR ${ltp.toFixed(2)}) crossed HIGH target (NPR ${w.highTarget.toFixed(2)})!`;
        } else if (w.lowTarget && ltp <= w.lowTarget) {
            triggered = true;
            alertMessage = `🔻 STOP LOSS ALERT: ${w.symbol} LTP (NPR ${ltp.toFixed(2)}) dropped to LOW target (NPR ${w.lowTarget.toFixed(2)})!`;
        }

        if (triggered && !w.triggered) {
            w.triggered = true;
            w.triggeredAt = new Date().toLocaleTimeString();
            w.triggerMsg = alertMessage;
            hasNewTriggers = true;
            playAlertSound();
            setTimeout(() => alert(alertMessage), 100);
        }
    });

    if (hasNewTriggers) {
        saveWatchlist();
    }
}

function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    } catch(e) {}
}

function renderWatchlistView() {
    loadWatchlist();
    initWatchlistModal();

    const tbody = document.getElementById("watchlistTableBody");
    if (!tbody) return;

    let triggeredCount = 0;
    let highCount = 0;
    let lowCount = 0;

    const rowsHtml = customWatchlist.map(w => {
        const stock = stocksData.find(s => s.symbol === w.symbol);
        const ltp = stock ? stock.ltp : null;
        const diff = stock ? stock.diff : 0;
        const diffPct = stock ? stock.diff_percent : 0;
        const isUp = diff >= 0;

        if (w.highTarget) highCount++;
        if (w.lowTarget) lowCount++;
        if (w.triggered) triggeredCount++;

        let statusBadge = `<span style="background: rgba(99,102,241,0.15); color: #818cf8; padding: 3px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">⏳ MONITORING</span>`;
        if (w.triggered) {
            statusBadge = `<span style="background: rgba(239,68,68,0.25); color: #ef4444; padding: 3px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 700;" class="pulse-indicator">🔔 TRIGGERED!</span>`;
        }

        const highBadge = w.highTarget
            ? `<span style="color: #10b981; font-weight: 700; font-family: monospace;">NPR ${w.highTarget.toFixed(2)}</span>`
            : `<span style="color: var(--text-muted);">—</span>`;

        const lowBadge = w.lowTarget
            ? `<span style="color: #ef4444; font-weight: 700; font-family: monospace;">NPR ${w.lowTarget.toFixed(2)}</span>`
            : `<span style="color: var(--text-muted);">—</span>`;

        return `
            <tr style="${w.triggered ? 'background: rgba(239,68,68,0.06); border-left: 4px solid #ef4444;' : ''}">
                <td>
                    <span class="font-bold monospace" style="cursor:pointer; color: var(--color-accent);" onclick="openStockDetail('${w.symbol}')">${w.symbol}</span>
                </td>
                <td style="font-size: 0.88rem; color: var(--text-secondary); max-width: 220px;">${stock ? (stock.fullName || stock.sector || '—') : '—'}</td>
                <td class="text-right monospace font-bold">
                    ${ltp ? `NPR ${ltp.toFixed(2)}` : '<span style="color: var(--text-muted);">—</span>'}
                </td>
                <td class="text-right monospace ${isUp ? 'text-up' : 'text-down'} font-bold">
                    ${stock ? `${isUp ? '+' : ''}${diffPct.toFixed(2)}%` : '—'}
                </td>
                <td class="text-right monospace">${highBadge}</td>
                <td class="text-right monospace">${lowBadge}</td>
                <td class="text-center">${statusBadge}</td>
                <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 240px;">
                    ${w.triggerMsg ? `<strong style="color: #ef4444;">${w.triggerMsg}</strong>` : (w.notes || '—')}
                </td>
                <td class="text-center">
                    <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem; color: var(--color-down);" onclick="deleteWatchlistItem(${w.id})">Remove</button>
                </td>
            </tr>
        `;
    }).join("");

    const el = id => document.getElementById(id);
    if (el("watchlistTotalCount")) el("watchlistTotalCount").textContent = customWatchlist.length;
    if (el("watchlistTriggeredCount")) el("watchlistTriggeredCount").textContent = triggeredCount;
    if (el("watchlistHighTargetsCount")) el("watchlistHighTargetsCount").textContent = highCount;
    if (el("watchlistLowTargetsCount")) el("watchlistLowTargetsCount").textContent = lowCount;

    if (customWatchlist.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center loading-placeholder">Your watchlist is empty. Click "Add Watchlist Alert" to monitor price targets!</td></tr>`;
    } else {
        tbody.innerHTML = rowsHtml;
    }
}

function deleteWatchlistItem(id) {
    if (confirm("Are you sure you want to remove this price alert from your watchlist?")) {
        customWatchlist = customWatchlist.filter(w => w.id !== id);
        saveWatchlist();
    }
}

function initWatchlistModal() {
    const btnOpen = document.getElementById("btnOpenAddWatchlistModal");
    const dialog = document.getElementById("addWatchlistDialog");
    const btnClose = document.getElementById("closeAddWatchlistBtn");
    const btnCancel = document.getElementById("btnCancelAddWatchlist");
    const form = document.getElementById("addWatchlistForm");

    if (btnOpen && dialog && !btnOpen._bound) {
        btnOpen._bound = true;

        // Populate Watchlist Scrip select dropdown
        const selectSymbol = document.getElementById("watchSymbol");
        if (selectSymbol && selectSymbol.children.length <= 1) {
            const sorted = masterTickers.length ? [...masterTickers].sort((a, b) => a.symbol.localeCompare(b.symbol)) : stocksData;
            if (sorted.length) {
                selectSymbol.innerHTML = `<option value="">-- Select Scrip (329+ NEPSE Tickers) --</option>` +
                    sorted.map(s => `<option value="${s.symbol}">${s.symbol} - ${s.fullName || s.sector || ''}</option>`).join("");
            }
        }

        btnOpen.onclick = () => dialog.showModal();
        if (btnClose) btnClose.onclick = () => dialog.close();
        if (btnCancel) btnCancel.onclick = () => dialog.close();

        if (form && !form._bound) {
            form._bound = true;
            form.onsubmit = (e) => {
                e.preventDefault();
                const symbol = document.getElementById("watchSymbol").value;
                const highTarget = parseFloat(document.getElementById("watchHighTarget").value) || null;
                const lowTarget = parseFloat(document.getElementById("watchLowTarget").value) || null;
                const notes = document.getElementById("watchNotes").value.trim();

                if (!symbol) {
                    alert("Please select a ticker symbol.");
                    return;
                }

                if (!highTarget && !lowTarget) {
                    alert("Please enter at least one High Alert Target or Low Alert Target.");
                    return;
                }

                customWatchlist.unshift({
                    id: Date.now(),
                    symbol,
                    highTarget,
                    lowTarget,
                    notes: notes || "Price alert monitor",
                    triggered: false
                });

                saveWatchlist();
                form.reset();
                dialog.close();
                alert(`Added price alert monitor for ${symbol}!`);
            };
        }
    }
}


// ============================================================
// Standard NEPSE Sector Treemap Heat Map Generator (Finviz / TradingView Style)
// ============================================================
let currentBubbleFilter = "all";
let currentBubbleSector = "all";
let currentSizeMode = "turnover";

function renderHeatbubbleView() {
    const container = document.getElementById("heatbubbleContainer");
    if (!container) return;

    if (!stocksData.length && !indicesData.length) {
        container.innerHTML = `<p style="color: var(--text-muted); padding: 40px;">No live price data available to render heat map.</p>`;
        return;
    }

    // Bind filter tabs, sector select & size mode select
    document.querySelectorAll("[data-bubble-filter]").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll("[data-bubble-filter]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentBubbleFilter = btn.getAttribute("data-bubble-filter");
            renderHeatbubbleView();
        };
    });

    const sectorSelect = document.getElementById("bubbleSectorSelect");
    if (sectorSelect) {
        sectorSelect.onchange = () => {
            currentBubbleSector = sectorSelect.value;
            renderHeatbubbleView();
        };
    }

    const sizeSelect = document.getElementById("heatmapSizeMode");
    if (sizeSelect) {
        sizeSelect.onchange = () => {
            currentSizeMode = sizeSelect.value;
            renderHeatbubbleView();
        };
    }

    let items = stocksData.map(s => {
        const sma = s.sma20 || s.dma20;
        const diffPct20SMA = sma ? ((s.ltp - sma) / sma) * 100 : 0;
        const turnoverVal = s.turnover || ((s.ltp || 100) * (s.volume || 1000)) || 10000;
        const volumeVal = s.volume || 100;

        return {
            symbol: s.symbol,
            fullName: s.fullName || s.symbol,
            sector: s.sector || "Others",
            ltp: s.ltp || 0,
            diff: s.diff || 0,
            diffPct: s.diff_percent || 0,
            volume: volumeVal,
            turnover: turnoverVal,
            sma20: sma,
            diffPct20SMA: diffPct20SMA,
            sizeVal: currentSizeMode === "volume" ? volumeVal : turnoverVal
        };
    });

    // Apply Sector Filter
    if (currentBubbleSector !== "all") {
        items = items.filter(i => i.sector && i.sector.toLowerCase() === currentBubbleSector.toLowerCase());
    }

    // Apply Tab Filters
    if (currentBubbleFilter === "top50") {
        items.sort((a, b) => b.sizeVal - a.sizeVal);
        items = items.slice(0, 50);
    } else if (currentBubbleFilter === "gainers") {
        items = items.filter(i => i.diffPct > 0).sort((a, b) => b.diffPct - a.diffPct);
    } else if (currentBubbleFilter === "decliners") {
        items = items.filter(i => i.diffPct < 0).sort((a, b) => a.diffPct - b.diffPct);
    }

    if (!items.length) {
        container.innerHTML = `<p style="color: var(--text-muted); padding: 40px;">No stocks match the selected filter criteria.</p>`;
        return;
    }

    if (typeof d3 === "undefined") {
        container.innerHTML = `<p style="color: var(--text-muted); padding: 40px;">Loading D3 visualization library...</p>`;
        return;
    }

    container.innerHTML = "";

    const width = container.clientWidth || 980;
    const height = Math.max(540, Math.min(760, Math.round(width * 0.58)));

    // Create or select floating tooltip
    let tooltip = document.getElementById("heatmapTooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "heatmapTooltip";
        tooltip.className = "heatmap-tooltip";
        document.body.appendChild(tooltip);
    }

    // Group items by Sector into hierarchical tree
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
        .paddingTop(22)
        .paddingInner(2)
        .tile(d3.treemapBinary)(root);

    const svg = d3.select(container)
        .append("svg")
        .attr("class", "treemap-svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

    // Function to pick tile color based on % change
    const getTileColor = (pct) => {
        if (pct >= 5.0) return "#059669";      // Circuit / Strong Gain (+5%+)
        if (pct >= 3.0) return "#10b981";      // Bright Green (+3% to +5%)
        if (pct >= 1.0) return "#047857";      // Medium Green (+1% to +3%)
        if (pct > 0.0) return "#065f46";       // Soft Green (+0.1% to +1%)
        if (pct === 0.0) return "#374151";      // Neutral Charcoal (0%)
        if (pct > -1.0) return "#881337";      // Soft Red (-0.1% to -1%)
        if (pct > -3.0) return "#b91c1c";      // Medium Red (-1% to -3%)
        if (pct > -5.0) return "#dc2626";      // Bright Red (-3% to -5%)
        return "#991b1b";                       // Deep Crimson (-5%+)
    };

    // Render Sector Groups (Headers & Bounding Boxes)
    const sectorNodes = root.children || [];
    const sectorGroup = svg.selectAll(".treemap-sector-group")
        .data(sectorNodes)
        .enter()
        .append("g")
        .attr("class", "treemap-sector-group")
        .attr("transform", d => `translate(${d.x0},${d.y0})`);

    sectorGroup.append("rect")
        .attr("class", "sector-bg")
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0));

    sectorGroup.append("text")
        .attr("class", "treemap-sector-label")
        .attr("x", 6)
        .attr("y", 15)
        .style("display", d => (d.x1 - d.x0 > 45 && d.y1 - d.y0 > 20) ? "block" : "none")
        .text(d => d.data.name);

    // Render Stock Leaf Nodes
    const leafNodes = root.leaves();

    const node = svg.selectAll(".treemap-node")
        .data(leafNodes)
        .enter()
        .append("g")
        .attr("class", "treemap-node")
        .attr("transform", d => `translate(${d.x0},${d.y0})`)
        .on("click", (event, d) => {
            openStockDetail(d.data.symbol);
        })
        .on("mousemove", (event, d) => {
            const data = d.data;
            const pct = data.diffPct || 0;
            const isUp = pct >= 0;

            tooltip.style.display = "block";
            tooltip.style.left = `${Math.min(window.innerWidth - 240, event.clientX + 16)}px`;
            tooltip.style.top = `${Math.min(window.innerHeight - 200, event.clientY + 16)}px`;

            tooltip.innerHTML = `
                <div style="font-weight: 700; font-size: 0.95rem; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 4px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                    <span>${data.symbol}</span>
                    <span style="font-size: 0.76rem; background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 4px;">${data.sector}</span>
                </div>
                <div style="font-size: 0.8rem; color: #e2e8f0; line-height: 1.55;">
                    <div style="color: #94a3b8; font-size: 0.78rem; margin-bottom: 4px;">${data.fullName}</div>
                    <div>LTP: <strong>NPR ${data.ltp.toFixed(2)}</strong></div>
                    <div>Change: <strong style="color: ${isUp ? '#34d399' : '#f87171'};">${isUp ? '+' : ''}${data.diff.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)</strong></div>
                    <div>Traded Volume: <strong>${data.volume.toLocaleString()} shares</strong></div>
                    <div>Turnover: <strong>${formatNPR(data.turnover)}</strong></div>
                    ${data.sma20 ? `<div>20 SMA: <strong>NPR ${data.sma20.toFixed(2)}</strong> (<span style="color:${data.diffPct20SMA >= 0 ? '#34d399' : '#f87171'}">${data.diffPct20SMA >= 0 ? '+' : ''}${data.diffPct20SMA.toFixed(2)}%</span>)</div>` : ''}
                </div>
            `;
        })
        .on("mouseleave", () => {
            tooltip.style.display = "none";
        });

    node.append("rect")
        .attr("class", "treemap-tile")
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("fill", d => getTileColor(d.data.diffPct));

    // Render Symbol Text
    node.append("text")
        .attr("class", "treemap-tile-text-symbol")
        .attr("x", d => (d.x1 - d.x0) / 2)
        .attr("y", d => {
            const h = d.y1 - d.y0;
            return h >= 38 ? (h / 2) - 4 : (h / 2) + 3;
        })
        .style("font-size", d => {
            const w = d.x1 - d.x0;
            const h = d.y1 - d.y0;
            const size = Math.min(w * 0.24, h * 0.35);
            return `${Math.max(9, Math.min(22, Math.round(size)))}px`;
        })
        .style("display", d => {
            const w = d.x1 - d.x0;
            const h = d.y1 - d.y0;
            return (w >= 28 && h >= 18) ? "block" : "none";
        })
        .text(d => d.data.symbol);

    // Render % Change Text
    node.append("text")
        .attr("class", "treemap-tile-text-change")
        .attr("x", d => (d.x1 - d.x0) / 2)
        .attr("y", d => (d.y1 - d.y0) / 2 + 12)
        .style("font-size", d => {
            const w = d.x1 - d.x0;
            const h = d.y1 - d.y0;
            const size = Math.min(w * 0.18, h * 0.28);
            return `${Math.max(8, Math.min(16, Math.round(size)))}px`;
        })
        .style("display", d => {
            const w = d.x1 - d.x0;
            const h = d.y1 - d.y0;
            return (w >= 36 && h >= 38) ? "block" : "none";
        })
        .text(d => `${d.data.diffPct > 0 ? '+' : ''}${d.data.diffPct.toFixed(2)}%`);
}

// ============================================================
// Position Size & Risk Management Calculator Engine
// ============================================================
let calcLastSuggestedShares = 0;

function openPositionCalcModal(symbol = "", ltp = null, sl = null, tp = null) {
    const dialog = document.getElementById("positionSizeDialog");
    if (!dialog) return;

    // Populate stock dropdown if needed
    const select = document.getElementById("calcSymbolSelect");
    if (select && select.options.length <= 1 && stocksData.length) {
        stocksData.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.symbol;
            opt.textContent = `${s.symbol} - NPR ${(s.ltp || 0).toFixed(2)}`;
            select.appendChild(opt);
        });
    }

    if (symbol && select) {
        select.value = symbol;
    }

    if (ltp !== null) {
        document.getElementById("calcEntryPrice").value = ltp;
    } else if (symbol) {
        const stock = stocksData.find(s => s.symbol === symbol);
        if (stock && stock.ltp) document.getElementById("calcEntryPrice").value = stock.ltp;
    }

    if (sl !== null) {
        document.getElementById("calcStopLossPrice").value = sl;
    } else {
        const entry = parseFloat(document.getElementById("calcEntryPrice").value) || 500;
        document.getElementById("calcStopLossPrice").value = (entry * 0.92).toFixed(2); // Default 8% SL
    }

    if (tp !== null) {
        document.getElementById("calcTakeProfitPrice").value = tp;
    } else {
        const entry = parseFloat(document.getElementById("calcEntryPrice").value) || 500;
        const slVal = parseFloat(document.getElementById("calcStopLossPrice").value) || (entry * 0.92);
        const risk = entry - slVal;
        document.getElementById("calcTakeProfitPrice").value = (entry + (risk * 2.0)).toFixed(2); // Default 1:2 RR
    }

    recalculatePositionSize();
    dialog.showModal();
}

function recalculatePositionSize() {
    const capital = parseFloat(document.getElementById("calcAccountCapital").value) || 0;
    const riskPct = parseFloat(document.getElementById("calcMaxRiskPct").value) || 0;
    const entry = parseFloat(document.getElementById("calcEntryPrice").value) || 0;
    const sl = parseFloat(document.getElementById("calcStopLossPrice").value) || 0;
    const tp = parseFloat(document.getElementById("calcTakeProfitPrice").value) || 0;

    const riskBadge = document.getElementById("calcRiskBadge");
    const suggestedSharesEl = document.getElementById("calcSuggestedShares");
    const positionValueEl = document.getElementById("calcPositionValue");
    const riskPerShareEl = document.getElementById("calcRiskPerShare");
    const maxLossEl = document.getElementById("calcMaxLossNPR");
    const rrRatioEl = document.getElementById("calcRewardRiskRatio");
    const expectedProfitEl = document.getElementById("calcExpectedProfit");
    const executeBtn = document.getElementById("calcBtnExecutePortfolio");

    const maxLossNPR = capital * (riskPct / 100);
    if (maxLossEl) maxLossEl.textContent = formatNPR(maxLossNPR);

    if (entry <= 0 || sl <= 0 || sl >= entry) {
        if (riskBadge) {
            riskBadge.textContent = "INVALID SL LEVEL";
            riskBadge.style.background = "rgba(239,68,68,0.2)";
            riskBadge.style.color = "#ef4444";
            riskBadge.style.borderColor = "rgba(239,68,68,0.4)";
        }
        if (suggestedSharesEl) suggestedSharesEl.textContent = "0 Shares";
        if (positionValueEl) positionValueEl.innerHTML = "Stop Loss must be lower than Entry Price.";
        if (riskPerShareEl) riskPerShareEl.textContent = "Invalid SL";
        if (rrRatioEl) rrRatioEl.textContent = "0.00 : 1";
        if (expectedProfitEl) expectedProfitEl.textContent = "NPR 0.00";
        if (executeBtn) executeBtn.disabled = true;
        calcLastSuggestedShares = 0;
        return;
    }

    const riskPerShare = entry - sl;
    const riskPerSharePct = (riskPerShare / entry) * 100;
    const suggestedShares = Math.floor(maxLossNPR / riskPerShare);
    const positionValue = suggestedShares * entry;
    const capitalAllocPct = capital > 0 ? (positionValue / capital) * 100 : 0;

    const rewardPerShare = (tp > entry) ? (tp - entry) : 0;
    const rrRatio = riskPerShare > 0 ? (rewardPerShare / riskPerShare) : 0;
    const expectedProfit = suggestedShares * rewardPerShare;

    calcLastSuggestedShares = suggestedShares;

    if (riskBadge) {
        riskBadge.textContent = "VALID SETUP";
        riskBadge.style.background = "rgba(16,185,129,0.15)";
        riskBadge.style.color = "#10b981";
        riskBadge.style.borderColor = "rgba(16,185,129,0.3)";
    }

    if (suggestedSharesEl) suggestedSharesEl.textContent = `${suggestedShares.toLocaleString()} Shares`;
    if (positionValueEl) positionValueEl.innerHTML = `Position Value: <strong>${formatNPR(positionValue)}</strong> (${capitalAllocPct.toFixed(2)}% Capital)`;

    if (riskPerShareEl) riskPerShareEl.textContent = `NPR ${riskPerShare.toFixed(2)} (${riskPerSharePct.toFixed(2)}%)`;
    if (rrRatioEl) rrRatioEl.textContent = `${rrRatio.toFixed(2)} : 1`;
    if (expectedProfitEl) expectedProfitEl.textContent = formatNPR(expectedProfit);
    if (executeBtn) executeBtn.disabled = suggestedShares <= 0;
}

function initPositionCalcEngine() {
    const dialog = document.getElementById("positionSizeDialog");
    const btnOpenHeader = document.getElementById("btnOpenPositionCalc");
    const closeBtn = document.getElementById("closePositionCalcBtn");

    if (btnOpenHeader) btnOpenHeader.onclick = () => openPositionCalcModal();
    if (closeBtn && dialog) closeBtn.onclick = () => dialog.close();

    // Input listeners for live recalculation
    ["calcAccountCapital", "calcMaxRiskPct", "calcEntryPrice", "calcStopLossPrice", "calcTakeProfitPrice"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener("input", recalculatePositionSize);
    });

    // Risk Pill buttons
    document.querySelectorAll(".calc-risk-pill").forEach(btn => {
        btn.onclick = () => {
            const risk = btn.getAttribute("data-risk");
            const riskInput = document.getElementById("calcMaxRiskPct");
            if (riskInput) {
                riskInput.value = risk;
                recalculatePositionSize();
            }
        };
    });

    // Scrip Select change listener
    const select = document.getElementById("calcSymbolSelect");
    if (select) {
        select.addEventListener("change", e => {
            const sym = e.target.value;
            if (sym) {
                const stock = stocksData.find(s => s.symbol === sym);
                if (stock && stock.ltp) {
                    document.getElementById("calcEntryPrice").value = stock.ltp;
                    document.getElementById("calcStopLossPrice").value = (stock.ltp * 0.92).toFixed(2);
                    document.getElementById("calcTakeProfitPrice").value = (stock.ltp * 1.16).toFixed(2);
                    recalculatePositionSize();
                }
            }
        });
    }

    // Execute / Add to Portfolio Button
    const executeBtn = document.getElementById("calcBtnExecutePortfolio");
    if (executeBtn) {
        executeBtn.onclick = () => {
            const selectEl = document.getElementById("calcSymbolSelect");
            const symbol = (selectEl && selectEl.value) ? selectEl.value : "CUSTOM";
            const entry = parseFloat(document.getElementById("calcEntryPrice").value) || 0;
            const sl = parseFloat(document.getElementById("calcStopLossPrice").value) || null;
            const tp = parseFloat(document.getElementById("calcTakeProfitPrice").value) || null;
            const shares = calcLastSuggestedShares;

            if (shares <= 0 || entry <= 0) {
                alert("Please enter valid trade levels to execute position sizing.");
                return;
            }

            const newHolding = {
                id: Date.now(),
                symbol: symbol,
                shares: shares,
                buyPrice: entry,
                tp: tp,
                sl: sl,
                setup: "Risk Calc Sized",
                notes: `Calculated with 1% Risk Sizing Rule. Risk Per Share: NPR ${(entry - (sl || 0)).toFixed(2)}.`
            };

            portfolioHoldings.push(newHolding);
            savePortfolio();
            renderPortfolioView();

            if (dialog) dialog.close();
            alert(`🎉 Success! Added ${shares.toLocaleString()} shares of ${symbol} at NPR ${entry.toFixed(2)} to your Active Portfolio!`);
        };
    }

    const btnStrategyCalc = document.getElementById("btnOpenPositionCalcStrategy");
    if (btnStrategyCalc) {
        btnStrategyCalc.onclick = () => openPositionCalcModal();
    }
}

// ============================================================
// Render Dedicated Fractal Sweep Strategy Signals View
// ============================================================
function renderStrategyView() {
    const tbody = document.getElementById("strategyTableBody");
    if (!tbody) return;

    const uptrends = stocksData.filter(s => {
        if (s.is_ema_aligned) return true;
        const e20 = s.ema20 || s.sma20 || s.dma20;
        const e50 = s.sma50 || s.ema50;
        return (e20 && e50 && e20 >= e50);
    });

    let matches = stocksData.filter(s => s.is_ema_fractal_match || (s.is_ema_aligned && s.is_fractal_sweep));
    if (!matches.length) {
        matches = uptrends;
    }

    const matchCountEl = document.getElementById("strategyMatchCount");
    if (matchCountEl) matchCountEl.textContent = `${matches.length} Scrips`;

    const uptrendCountEl = document.getElementById("strategyUptrendCount");
    if (uptrendCountEl) uptrendCountEl.textContent = `${uptrends.length} Scrips`;

    const countEl = document.getElementById("strategyTableCount");
    if (countEl) countEl.textContent = `Showing ${matches.length} matching strategy setups`;

    if (!matches.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center loading-placeholder">No securities currently match the EMA 20>50>100 + Fractal Low Sweep criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = matches.map(s => {
        const isUp = (s.diff || s.point_change || 0) >= 0;
        const pctText = (isUp ? "+" : "") + (s.diff_percent || s.percentage_change || 0).toFixed(2) + "%";
        const e20 = s.ema20 ? s.ema20.toFixed(2) : (s.sma20 || s.dma20 ? (s.sma20 || s.dma20).toFixed(2) : "-");
        const e50 = s.ema50 ? s.ema50.toFixed(2) : (s.sma50 ? s.sma50.toFixed(2) : "-");
        const e100 = s.ema100 ? s.ema100.toFixed(2) : "-";
        const fracLow = s.fractal_low ? `NPR ${s.fractal_low.toFixed(2)}` : (s.fifty_two_week_low ? `NPR ${s.fifty_two_week_low.toFixed(2)}` : "-");
        const isMatched = s.is_ema_fractal_match || (s.is_ema_aligned && s.is_fractal_sweep);

        return `
            <tr onclick="openStockDetail('${s.symbol}')" style="cursor: pointer;">
                <td class="font-bold monospace">
                    ${s.symbol}
                    ${isMatched ? '<span style="background: rgba(99,102,241,0.2); color: #818cf8; border: 1px solid rgba(99,102,241,0.4); padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; margin-left: 6px;">🎯 SWEEP</span>' : ''}
                </td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${s.sector || '-'}</td>
                <td class="text-right font-bold monospace">${s.ltp ? s.ltp.toFixed(2) : '0.00'}</td>
                <td class="text-right monospace ${isUp ? 'text-up' : 'text-down'}">${pctText}</td>
                <td class="text-right monospace" style="color: #34d399;">${e20}</td>
                <td class="text-right monospace" style="color: #60a5fa;">${e50}</td>
                <td class="text-right monospace" style="color: #f472b6;">${e100}</td>
                <td class="text-right monospace font-bold" style="color: #f59e0b;">${fracLow}</td>
                <td class="text-center">
                    <span style="background: ${isMatched ? 'rgba(16,185,129,0.18)' : 'rgba(99,102,241,0.15)'}; color: ${isMatched ? '#10b981' : '#818cf8'}; border: 1px solid ${isMatched ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}; padding: 3px 10px; border-radius: 6px; font-weight: 700; font-size: 0.78rem;">
                        ${isMatched ? '🟢 BULLISH REVERSAL' : '📈 EMA ALIGNED'}
                    </span>
                </td>
                <td class="text-center" onclick="event.stopPropagation();">
                    <button class="btn btn-primary" style="padding: 3px 10px; font-size: 0.76rem;" onclick="openPositionCalcModal('${s.symbol}', ${s.ltp || 0}, ${s.fractal_low || s.fifty_two_week_low || 0})">
                        🧮 Sizing Calc
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}
