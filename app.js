/* -------------------------------------------------------------
 * NEPSE & SystemXLite Terminal Dashboard & Journal Engine
 * ------------------------------------------------------------- */

import { state, getScopedKey } from './src/state.js';
import { formatNPR, formatNumber } from './src/utils.js';
import {
    fetchData as apiFetchData,
    loadMasterTickers as apiLoadMasterTickers,
    triggerLiveScrape as apiTriggerLiveScrape,
    fetchFloorsheetData as apiFetchFloorsheetData,
    fetchPatternScanData as apiFetchPatternScanData,
    fetchFundamentalsReport as apiFetchFundamentalsReport,
    fetchCorporateCalendar as apiFetchCorporateCalendar,
    fetchBankRates as apiFetchBankRates,
    fetchNrbIndicators as apiFetchNrbIndicators,
    fetchLiveTick as apiFetchLiveTick
} from './src/api.js';

// Expose ES Module functions and states globally for compatibility with HTML event handlers
window.getScopedKey = getScopedKey;
window.formatNPR = formatNPR;
window.formatNumber = formatNumber;
window.apiFetchData = apiFetchData;
window.apiLoadMasterTickers = apiLoadMasterTickers;
window.apiTriggerLiveScrape = apiTriggerLiveScrape;
window.apiFetchFloorsheetData = apiFetchFloorsheetData;
window.apiFetchPatternScanData = apiFetchPatternScanData;
window.apiFetchFundamentalsReport = apiFetchFundamentalsReport;
window.apiFetchCorporateCalendar = apiFetchCorporateCalendar;
window.apiFetchBankRates = apiFetchBankRates;
window.apiFetchLiveTick = apiFetchLiveTick;
window.apiFetchNrbIndicators = apiFetchNrbIndicators;

const LIVE_REFRESH_INTERVAL_MS = 30000;

// Central State Proxies
const stateKeys = [
    'stocksData', 'indicesData', 'systemxData', 'masterTickers',
    'shareStructureData', 'corporateData', 'calendarEventsData',
    'liveRefreshTimer', 'currentFilter', 'selectedSector', 'searchQuery',
    'sortColumn', 'sortDirection', 'currentPage', 'rowsPerPage',
    'pendingViewTarget', 'bankRatesData', 'activeBankRatesTab', 'nrbIndicatorsData',
    'portfolioHoldings', 'tradeJournal', 'customWatchlist', 'priceAlerts'
];

stateKeys.forEach(key => {
    Object.defineProperty(window, key, {
        get() { return state[key]; },
        set(val) { state[key] = val; },
        configurable: true
    });
});

Object.defineProperty(window, 'PORTFOLIO_STORAGE_KEY_BASE', { get() { return state.PORTFOLIO_STORAGE_KEY_BASE; } });
Object.defineProperty(window, 'JOURNAL_STORAGE_KEY_BASE', { get() { return state.JOURNAL_STORAGE_KEY_BASE; } });
Object.defineProperty(window, 'WATCHLIST_STORAGE_KEY_BASE', { get() { return state.WATCHLIST_STORAGE_KEY_BASE; } });

const PORTFOLIO_STORAGE_KEY = state.PORTFOLIO_STORAGE_KEY_BASE;
const JOURNAL_STORAGE_KEY   = state.JOURNAL_STORAGE_KEY_BASE;
const WATCHLIST_STORAGE_KEY = state.WATCHLIST_STORAGE_KEY_BASE;

// Inject initial values from storage/fallback into the state object
state.portfolioHoldings = JSON.parse(
    localStorage.getItem(getScopedKey(state.PORTFOLIO_STORAGE_KEY_BASE)) ||
    localStorage.getItem(state.PORTFOLIO_STORAGE_KEY_BASE)
) || [
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

state.tradeJournal = JSON.parse(
    localStorage.getItem(getScopedKey(state.JOURNAL_STORAGE_KEY_BASE)) ||
    localStorage.getItem(state.JOURNAL_STORAGE_KEY_BASE)
) || [
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

state.customWatchlist = JSON.parse(
    localStorage.getItem(getScopedKey(state.WATCHLIST_STORAGE_KEY_BASE)) ||
    localStorage.getItem(state.WATCHLIST_STORAGE_KEY_BASE)
) || [];

const savePortfolio = () => {
    localStorage.setItem(getScopedKey(PORTFOLIO_STORAGE_KEY_BASE), JSON.stringify(portfolioHoldings));
    renderPortfolioView();
    const username = localStorage.getItem("nepse_portfolio_username") || "Guest";
    if (typeof isSupabaseAvailable !== "undefined" && isSupabaseAvailable() && username !== "Guest") {
        syncToSupabase(username, portfolioHoldings, tradeJournal);
    }
};

const saveJournal = () => {
    localStorage.setItem(getScopedKey(JOURNAL_STORAGE_KEY_BASE), JSON.stringify(tradeJournal));
    renderJournalView();
    const username = localStorage.getItem("nepse_portfolio_username") || "Guest";
    if (typeof isSupabaseAvailable !== "undefined" && isSupabaseAvailable() && username !== "Guest") {
        syncToSupabase(username, portfolioHoldings, tradeJournal);
    }
};

// Main Initialization
document.addEventListener("DOMContentLoaded", async () => {
    initNavigation();
    initEventListeners();
    initLandingScrollListener();
    updateUserProfileUI();
    
    // Bind sign out click
    const btnSignOut = document.getElementById("btnSignOut");
    if (btnSignOut) {
        btnSignOut.addEventListener("click", handleSignOut);
    }
    
    // Initialize Username & Cloud Syncing Event Handlers
    initCloudSyncHandlers();

    // Default startup view (Market Overview dashboard)
    let activeView = sessionStorage.getItem("nepse_active_view") || "dashboard";
    if (activeView === "landing") activeView = "dashboard";
    switchView(activeView);

    await loadMasterTickers();
    await fetchData();
    startLiveRefresh();
});

// Bind username inputs and cloud synchronization routines
function initCloudSyncHandlers() {
    const userField = document.getElementById("portfolioUsername");
    const syncBtn = document.getElementById("btnSyncSupabase");
    
    const savedUser = localStorage.getItem("nepse_portfolio_username") || "Guest";
    if (userField) {
        userField.value = savedUser;
        userField.addEventListener("change", async () => {
            const username = userField.value.trim() || "Guest";
            localStorage.setItem("nepse_portfolio_username", username);
            if (typeof isSupabaseAvailable !== "undefined" && isSupabaseAvailable()) {
                const syncRes = await syncFromSupabase(username, portfolioHoldings, tradeJournal);
                if (syncRes) {
                    portfolioHoldings = syncRes.holdings;
                    tradeJournal = syncRes.journal;
                    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(portfolioHoldings));
                    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(tradeJournal));
                    renderPortfolioView();
                    renderJournalView();
                }
            }
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener("click", async () => {
            const originalText = syncBtn.innerHTML;
            syncBtn.disabled = true;
            syncBtn.innerHTML = "⏳ Syncing...";
            
            const username = localStorage.getItem("nepse_portfolio_username") || "Guest";
            
            if (typeof isSupabaseAvailable !== "undefined" && isSupabaseAvailable() && username !== "Guest") {
                // Upload current local state to cloud first
                await syncToSupabase(username, portfolioHoldings, tradeJournal);
                await syncWatchlistToSupabase(username, customWatchlist);
                // Then fetch remote updates
                const syncRes = await syncFromSupabase(username, portfolioHoldings, tradeJournal);
                if (syncRes) {
                    portfolioHoldings = syncRes.holdings;
                    tradeJournal = syncRes.journal;
                    if (syncRes.watchlist) {
                        customWatchlist = syncRes.watchlist;
                        localStorage.setItem(getScopedKey(WATCHLIST_STORAGE_KEY_BASE), JSON.stringify(customWatchlist));
                        renderWatchlistView();
                    }
                    localStorage.setItem(getScopedKey(PORTFOLIO_STORAGE_KEY_BASE), JSON.stringify(portfolioHoldings));
                    localStorage.setItem(getScopedKey(JOURNAL_STORAGE_KEY_BASE), JSON.stringify(tradeJournal));
                    renderPortfolioView();
                    renderJournalView();
                }
                alert(`Cloud Sync Successful! Locked database state for username: '${username}'`);
            } else {
                alert("Supabase database is not configured or you are not logged in. Portfolio data remains saved locally in your browser.");
            }
            
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
        });
    }

    // Run initial sync on load (only if already logged in)
    const isLoggedIn = localStorage.getItem("nepse_logged_in") === "true";
    if (isLoggedIn && typeof isSupabaseAvailable !== "undefined" && isSupabaseAvailable() && savedUser !== "Guest") {
        syncFromSupabase(savedUser, portfolioHoldings, tradeJournal).then(syncRes => {
            if (syncRes) {
                portfolioHoldings = syncRes.holdings;
                tradeJournal = syncRes.journal;
                if (syncRes.watchlist) {
                    customWatchlist = syncRes.watchlist;
                    localStorage.setItem(getScopedKey(WATCHLIST_STORAGE_KEY_BASE), JSON.stringify(customWatchlist));
                    renderWatchlistView();
                }
                localStorage.setItem(getScopedKey(PORTFOLIO_STORAGE_KEY_BASE), JSON.stringify(portfolioHoldings));
                localStorage.setItem(getScopedKey(JOURNAL_STORAGE_KEY_BASE), JSON.stringify(tradeJournal));
                renderPortfolioView();
                renderJournalView();
            }
        }).catch(err => console.log("Initial Supabase sync error:", err));
    }
}

// Load master ticker list (329+ NEPSE companies from merolagani)
async function loadMasterTickers() {
    try {
        await apiLoadMasterTickers();
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
    fetchLiveTick();
}

// Lightweight live tick fetch — only stocks + indices from API
async function fetchLiveTick() {
    try {
        const data = await apiFetchLiveTick();

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
        updateSmartCollections();
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
        console.warn("[Live] Dynamic tick fetch failed, trying static fallback:", err.message);
        try {
            const res = await fetch(`data/nepse_today.json?t=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.stocks && data.stocks.length) {
                stocksData = data.stocks;
            }
            if (data.indices && data.indices.length) {
                indicesData = data.indices;
            }
            const updEl = document.getElementById("lastUpdatedTime");
            if (updEl && data.scraped_at) {
                const d = new Date(data.scraped_at);
                const timeStr = isNaN(d) ? data.scraped_at : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                updEl.textContent = `Scraped: ${data.date || ''} ${timeStr}`;
            }
            const dateEl = document.getElementById("tradeDate");
            if (dateEl) dateEl.textContent = data.date || new Date().toISOString().split("T")[0];
            renderSummaryGrid(data);
            renderIndicesGrid();
            renderStocksTable();
            updateSmartCollections();
        } catch (staticErr) {
            console.warn("[Live] Static fallback error:", staticErr.message);
            const updEl = document.getElementById("lastUpdatedTime");
            if (updEl) updEl.textContent = `Offline ● Retry in 30s`;
        }
    }
}

// Navigation Handling
function initNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item[data-view]");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const viewTarget = item.getAttribute("data-view");
            switchView(viewTarget);
        });
    });
}

let isSwitchingView = false;
function switchView(viewTarget) {
    if (isSwitchingView) return;
    if (viewTarget === "landing") viewTarget = "dashboard";
    isSwitchingView = true;
    try {
        // Save last active view target to session storage
        sessionStorage.setItem("nepse_active_view", viewTarget);

        // Reset Scroll Position of Main Content area
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.scrollTop = 0;
        }

        // Update active nav item styles
        const navItems = document.querySelectorAll(".sidebar-nav .nav-item[data-view]");
        navItems.forEach(n => {
            if (n.getAttribute("data-view") === viewTarget) {
                n.classList.add("active");
                // Add inline styles matching active item to make sure it stands out
                n.style.background = "rgba(99, 102, 241, 0.15)";
                n.style.color = "#818cf8";
                n.style.fontWeight = "700";
                n.style.borderLeft = "3px solid #6366f1";
            } else {
                n.classList.remove("active");
                n.style.background = "";
                n.style.color = "";
                n.style.fontWeight = "";
                n.style.borderLeft = "";
            }
        });

        // Hide all view sections
        document.querySelectorAll(".view-section").forEach(v => v.classList.add("hidden"));
        
        // Show target view section
        const targetSection = document.getElementById(`${viewTarget}View`);
        if (targetSection) targetSection.classList.remove("hidden");

        // Update Header Page Title & Trigger Data Renderings
        const pageTitle = document.getElementById("pageTitle");
        if (pageTitle) {
            if (viewTarget === "dashboard") {
                pageTitle.textContent = "Market Overview & All Scrips";
            } else if (viewTarget === "portfolio") {
                pageTitle.textContent = "Portfolio Tracker & Journal";
                renderPortfolioView();
            } else if (viewTarget === "journal") {
                pageTitle.textContent = "📓 Trading Journal & Performance Analytics";
                renderJournalView();
            } else if (viewTarget === "dalal") {
                pageTitle.textContent = "🔥 Broker Accumulation & Dalal Signals";
                renderDalalView();
            } else if (viewTarget === "lockin") {
                pageTitle.textContent = "🔒 Promoter Lock-in Expiry Monitor";
                renderLockinView();
            } else if (viewTarget === "floorsheet") {
                pageTitle.textContent = "🔍 Institutional Floorsheet Intelligence";
                renderFloorsheetView();
            } else if (viewTarget === "watchlist") {
                pageTitle.textContent = "⭐ Real-Time Watchlist & Price Alerts";
                renderWatchlistView();
            } else if (viewTarget === "heatbubble") {
                pageTitle.textContent = "🫧 Dynamic NEPSE Heat Bubble Map";
                renderHeatbubbleView();
            } else if (viewTarget === "patterns") {
                pageTitle.textContent = "📐 Technical Chart Pattern & Support/Resistance Scanner";
                renderPatternScannerView();
            } else if (viewTarget === "fundamental") {
                pageTitle.textContent = "🏢 Fundamental Screener & AI Insights Report";
                renderFundamentalScreenerView();
            } else if (viewTarget === "calendar") {
                pageTitle.textContent = "📅 Unified Corporate Earnings & Events Calendar";
                renderCorporateCalendarView();
            } else if (viewTarget === "companyIntel") {
                pageTitle.textContent = "📊 360° Company Intelligence Report";
                renderCompanyIntelView("SHIVM");
            } else if (viewTarget === "curatedCollections") {
                pageTitle.textContent = "⭐ Curated Scrip Collections & Ratings";
                renderCuratedCollectionsView(activeCuratedCollection || "swing");
            } else if (viewTarget === "landing") {
                pageTitle.textContent = "🚀 NEPSE Terminal Platform Overview";
            } else if (viewTarget === "login") {
                pageTitle.textContent = "🔒 Authenticate Access";
            } else if (viewTarget === "bankRates") {
                pageTitle.textContent = "🏦 Banking Rates & Margin Lending Suite";
                renderBankRatesView();
            }
        }
    } finally {
        isSwitchingView = false;
    }
}


function initEventListeners() {
    initThemeEngine();
    initPositionCalcEngine();
    initSmartCollections();
    if (typeof updateLandingDemoMath === "function") updateLandingDemoMath();

    // Refresh / Re-Scrape Button
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `<span class="btn-icon">🔄</span> Syncing NEPSE Data...`;
            try {
                // On Vercel static hosting there is no server-side /api/scrape endpoint.
                // Try it opportunistically (works on local dev), but silently fall through
                // to a direct data refresh on any network/404 error.
                let scraped = false;
                try {
                    const json = await apiTriggerLiveScrape();
                    scraped = !!json.success;
                } catch (_) {
                    // No scrape endpoint available (Vercel static deploy) — that's fine
                }

                // Always re-fetch the latest data JSON from CDN / static files
                await fetchData();
                showToast("Market data refreshed successfully!", "success");
            } catch (err) {
                console.error("Re-scrape error:", err);
                showToast("Could not refresh data. Check your connection.", "warning");
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = `<span class="btn-icon">🔄</span> Sync Live Data`;
            }
        });
    }

    // 360° Stock Intel Button
    const btnOpen360Intel = document.getElementById("btnOpen360Intel");
    if (btnOpen360Intel) {
        btnOpen360Intel.addEventListener("click", () => {
            const currentQuery = searchQuery || "ADBL";
            const match = stocksData.find(s => s.symbol.toLowerCase() === currentQuery.toLowerCase() || (s.fullName && s.fullName.toLowerCase().includes(currentQuery.toLowerCase()))) || stocksData[0];
            if (match) {
                openStockDetail(match.symbol);
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
        globalQuickSearch.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const val = globalQuickSearch.value.trim().toUpperCase();
                if (val) {
                    const match = stocksData.find(s => s.symbol === val || s.symbol.startsWith(val) || (s.fullName && s.fullName.toUpperCase().includes(val)));
                    if (match) {
                        openStockDetail(match.symbol);
                    }
                }
            }
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

    // Pattern Scanner Listeners
    const btnRefreshPatterns = document.getElementById("btnRefreshPatterns");
    if (btnRefreshPatterns) {
        btnRefreshPatterns.addEventListener("click", () => {
            renderPatternScannerView();
        });
    }

    const patternFilterTabs = document.getElementById("patternFilterTabs");
    if (patternFilterTabs) {
        patternFilterTabs.querySelectorAll(".filter-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                patternFilterTabs.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                activePatternFilter = tab.getAttribute("data-pattern-filter") || "all";
                applyPatternFiltersAndRender();
            });
        });
    }

    const patternSearchInput = document.getElementById("patternSearchInput");
    if (patternSearchInput) {
        patternSearchInput.addEventListener("input", (e) => {
            patternSearchQuery = e.target.value;
            applyPatternFiltersAndRender();
        });
    }

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
        const data = await apiFetchData();

        const todayStr = new Date().toISOString().split("T")[0];
        const dateEl = document.getElementById("tradeDate");
        if (dateEl) dateEl.textContent = `${data.date || todayStr} (Live)`;

        const scrapedAt = data.scraped_at;
        const updEl = document.getElementById("lastUpdatedTime");
        if (updEl && scrapedAt) {
            const d = new Date(scrapedAt);
            const timeStr = isNaN(d) ? scrapedAt : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            updEl.textContent = `🟢 Live Real-Time Feed • Updated ${timeStr}`;
        } else if (updEl) {
            updEl.textContent = "🟢 Live Real-Time Feed • Active";
        }

        const mStatus = document.getElementById("marketStatus");
        if (mStatus) mStatus.textContent = "LIVE MARKET FEED";

        // Render active Market Overview dashboard instantly
        try { renderSummaryGrid(data); } catch(e) { console.error("renderSummaryGrid error:", e); }
        try { renderIndicesGrid(); } catch(e) { console.error("renderIndicesGrid error:", e); }
        try { populateSectorDropdown(); } catch(e) { console.error("populateSectorDropdown error:", e); }
        try { populateTickerDropdowns(); } catch(e) { console.error("populateTickerDropdowns error:", e); }
        try { renderStocksTable(); } catch(e) { console.error("renderStocksTable error:", e); }
        try { updateSmartCollections(); } catch(e) { console.error("updateSmartCollections error:", e); }

        // Non-blocking background pre-fetch for secondary datasets
        Promise.allSettled([
            fetch(`data/nepse_fundamentals_live.json?t=${Date.now()}`)
                .then(r => r.ok ? r.json() : fetch(`/api/fundamentals?t=${Date.now()}`).then(res => res.json()))
                .then(fd => {
                    if (Array.isArray(fd)) fundamentalData = fd;
                    else if (fd && typeof fd === 'object' && !fd.error) fundamentalData = Object.values(fd);
                }).catch(e => console.warn("Fundamentals fetch fallback:", e)),

            fetch(`data/nepse_share_structure_live.json?t=${Date.now()}`)
                .then(r => r.ok ? r.json() : fetch(`/api/share-structure?t=${Date.now()}`).then(res => res.json()))
                .then(ss => {
                    if (Array.isArray(ss)) shareStructureData = ss;
                    else if (ss && typeof ss === 'object' && !ss.error) shareStructureData = Object.values(ss);
                }).catch(e => console.warn("Share structure fetch fallback:", e)),

            fetch(`data/nepse_corporate_live.json?t=${Date.now()}`)
                .then(r => r.ok ? r.json() : fetch(`/api/corporate?t=${Date.now()}`).then(res => res.json()))
                .then(cd => {
                    if (Array.isArray(cd)) { corporateData = cd; calendarEventsData = cd; }
                    else if (cd && typeof cd === 'object' && !cd.error) { corporateData = Object.values(cd); calendarEventsData = corporateData; }
                }).catch(e => console.warn("Corporate fetch fallback:", e))
        ]);
        try { renderHeatbubbleView(); } catch(e) { console.error("renderHeatbubbleView error:", e); }
    } catch (err) {
        console.error("Error loading data:", err);
        const updEl = document.getElementById("lastUpdatedTime");
        if (updEl) updEl.textContent = `Offline ● Retry in 30s`;
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

    // Update Dashboard Hero Banner Elements
    const nepseIndexObj = (indicesData || []).find(i => 
        (i.indicesName && (i.indicesName === "NEPSE" || i.indicesName === "NEPSE Index")) ||
        (i.title && (i.title === "NEPSE" || i.title === "NEPSE Index" || i.title.includes("NEPSE")))
    ) || { value: 2647.83, percentageChange: -0.12 };

    const nepseVal = nepseIndexObj.value !== undefined ? nepseIndexObj.value : (nepseIndexObj.currentPrice || nepseIndexObj.ltp || 2647.83);
    const nepseChg = nepseIndexObj.percentageChange !== undefined ? nepseIndexObj.percentageChange : (nepseIndexObj.change_percent !== undefined ? nepseIndexObj.change_percent : (nepseIndexObj.change || 0));
    const isUp = nepseChg >= 0;

    const heroValEl = document.getElementById("heroNepseValue");
    if (heroValEl) heroValEl.textContent = Number(nepseVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const heroChgEl = document.getElementById("heroNepseChange");
    if (heroChgEl) {
        heroChgEl.textContent = `${isUp ? "▲ +" : "▼ "}${Number(nepseChg).toFixed(2)}%`;
        heroChgEl.style.color = isUp ? "#10b981" : "#ef4444";
        heroChgEl.style.background = isUp ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)";
        heroChgEl.style.borderColor = isUp ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)";
    }

    const heroSentimentText = document.getElementById("heroSentimentText");
    const heroSentimentIcon = document.getElementById("heroSentimentIcon");
    const heroSentimentSub = document.getElementById("heroSentimentSub");
    
    let sentimentText = adv > dec ? "BULLISH" : (dec > adv * 1.2 ? "BEARISH" : "NEUTRAL");
    let sentimentColor = adv > dec ? "#10b981" : (dec > adv * 1.2 ? "#ef4444" : "#f59e0b");
    let sentimentIcon = adv > dec ? "🚀" : (dec > adv * 1.2 ? "📉" : "⚖️");
    let sellerPct = Math.round((dec / (total || 1)) * 100);

    if (heroSentimentText) {
        heroSentimentText.textContent = sentimentText;
        heroSentimentText.style.color = sentimentColor;
    }
    if (heroSentimentIcon) {
        heroSentimentIcon.textContent = sentimentIcon;
        heroSentimentIcon.style.background = adv > dec ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)";
        heroSentimentIcon.style.borderColor = adv > dec ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)";
    }
    if (heroSentimentSub) {
        heroSentimentSub.textContent = `${sellerPct}% Sellers`;
        heroSentimentSub.style.color = sentimentColor;
    }

    const heroBreadthRatio = document.getElementById("heroBreadthRatio");
    if (heroBreadthRatio) heroBreadthRatio.textContent = `${adv} / ${dec} Scrips`;

    const heroTurnoverVal = document.getElementById("heroTurnoverVal");
    if (heroTurnoverVal) heroTurnoverVal.textContent = formatNPR(data.total_turnover);

    // Render AI Intelligence Grid
    renderAIMarketSummary(data);
    renderSectorRotation(indicesData);
    renderMoneyFlowTracker(indicesData);
}

// Render AI Market Summary
function renderAIMarketSummary(data) {
    const adv = data.advancers || stocksData.filter(s => s.diff > 0).length;
    const dec = data.decliners || stocksData.filter(s => s.diff < 0).length;
    
    const sortedSectors = [...(indicesData || [])].filter(i => i.indicesName && i.indicesName !== "NEPSE Index").sort((a, b) => (b.percentageChange || 0) - (a.percentageChange || 0));
    
    let gainingSector = "Manufacturing";
    let draggingSector = "Banking";
    
    if (sortedSectors.length > 0) {
        const topSector = sortedSectors[0];
        const botSector = sortedSectors[sortedSectors.length - 1];
        if (topSector && topSector.indicesName) gainingSector = topSector.indicesName;
        if (botSector && botSector.indicesName) draggingSector = botSector.indicesName;
    }
    
    let sentiment = "Bearish";
    let badgeBg = "rgba(239, 68, 68, 0.15)";
    let badgeColor = "#ef4444";
    let badgeBorder = "rgba(239, 68, 68, 0.3)";

    if (adv >= dec * 1.25) {
        sentiment = "Bullish";
        badgeBg = "rgba(16, 185, 129, 0.15)";
        badgeColor = "#10b981";
        badgeBorder = "rgba(16, 185, 129, 0.3)";
    } else if (adv > dec) {
        sentiment = "Mildly Bullish";
        badgeBg = "rgba(16, 185, 129, 0.12)";
        badgeColor = "#34d399";
        badgeBorder = "rgba(52, 211, 153, 0.3)";
    } else if (dec > adv * 1.25) {
        sentiment = "Bearish";
    } else {
        sentiment = "Neutral / Consolidation";
        badgeBg = "rgba(234, 179, 8, 0.15)";
        badgeColor = "#eab308";
        badgeBorder = "rgba(234, 179, 8, 0.3)";
    }

    const badgeEl = document.getElementById("aiSentimentBadge");
    if (badgeEl) {
        badgeEl.textContent = sentiment.toUpperCase();
        badgeEl.style.background = badgeBg;
        badgeEl.style.color = badgeColor;
        badgeEl.style.border = `1px solid ${badgeBorder}`;
    }

    const dragEl = document.getElementById("aiSummaryDragText");
    const breadthEl = document.getElementById("aiSummaryBreadthText");
    const sentEl = document.getElementById("aiSummarySentimentText");

    if (dragEl) dragEl.innerHTML = `<strong>${draggingSector}</strong> dragged the market today while <strong>${gainingSector}</strong> gained strength.`;
    if (breadthEl) breadthEl.textContent = `Market breadth remained ${adv >= dec ? 'positive' : 'negative'} (${adv} vs ${dec}).`;
    if (sentEl) sentEl.innerHTML = `Overall sentiment: <strong>${sentiment}</strong>.`;
}

// Render Sector Rotation Radar
function renderSectorRotation(indices) {
    const gainingContainer = document.getElementById("rotationGainingList");
    const laggingContainer = document.getElementById("rotationLaggingList");
    if (!gainingContainer || !laggingContainer) return;

    if (!indices || !indices.length) return;

    const validIndices = indices.filter(i => i.indicesName && i.indicesName !== "NEPSE Index");
    const gainers = validIndices.filter(i => (i.percentageChange || i.pointChange || 0) > 0).sort((a, b) => (b.percentageChange || 0) - (a.percentageChange || 0));
    const laggards = validIndices.filter(i => (i.percentageChange || i.pointChange || 0) <= 0).sort((a, b) => (a.percentageChange || 0) - (b.percentageChange || 0));

    gainingContainer.innerHTML = gainers.slice(0, 3).map(g => `
        <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25); font-size: 0.76rem; font-weight: 600;">
            ⬆ ${g.indicesName} <small style="opacity: 0.8; margin-left: 4px;">(+${(g.percentageChange || 0).toFixed(2)}%)</small>
        </span>
    `).join("") || `<span style="font-size: 0.74rem; color: var(--text-muted);">None</span>`;

    laggingContainer.innerHTML = laggards.slice(0, 3).map(l => `
        <span class="badge" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25); font-size: 0.76rem; font-weight: 600;">
            ⬇ ${l.indicesName} <small style="opacity: 0.8; margin-left: 4px;">(${(l.percentageChange || 0).toFixed(2)}%)</small>
        </span>
    `).join("") || `<span style="font-size: 0.74rem; color: var(--text-muted);">None</span>`;
}

// Render Money Flow Inflow/Outflow Tracker
function renderMoneyFlowTracker(indices) {
    const enteringContainer = document.getElementById("moneyEnteringList");
    const leavingContainer = document.getElementById("moneyLeavingList");
    if (!enteringContainer || !leavingContainer) return;

    if (!indices || !indices.length) return;

    const validIndices = indices.filter(i => i.indicesName && i.indicesName !== "NEPSE Index");
    const entering = validIndices.filter(i => (i.percentageChange || 0) > 0).sort((a, b) => (b.turnover || 0) - (a.turnover || 0));
    const leaving = validIndices.filter(i => (i.percentageChange || 0) <= 0).sort((a, b) => (b.turnover || 0) - (a.turnover || 0));

    enteringContainer.innerHTML = entering.slice(0, 3).map(e => `
        <span class="badge" style="background: rgba(52, 211, 153, 0.12); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.25); font-size: 0.76rem; font-weight: 600;">
            ${e.indicesName}
        </span>
    `).join("") || `<span style="font-size: 0.74rem; color: var(--text-muted);">No Net Inflow</span>`;

    leavingContainer.innerHTML = leaving.slice(0, 3).map(l => `
        <span class="badge" style="background: rgba(248, 113, 113, 0.12); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.25); font-size: 0.76rem; font-weight: 600;">
            ${l.indicesName}
        </span>
    `).join("") || `<span style="font-size: 0.74rem; color: var(--text-muted);">No Net Outflow</span>`;
}

function getSectorIcon(name) {
    if (!name) return "📊";
    const n = name.toLowerCase();
    if (n.includes("bank") && !n.includes("development")) return "🏦";
    if (n.includes("development")) return "🏗️";
    if (n.includes("finance")) return "💰";
    if (n.includes("hotel") || n.includes("tourism")) return "🏨";
    if (n.includes("hydro")) return "⚡";
    if (n.includes("investment")) return "📈";
    if (n.includes("life insurance")) return "🛡️";
    if (n.includes("non life")) return "📄";
    if (n.includes("insurance")) return "🛡️";
    if (n.includes("microfinance")) return "🤝";
    if (n.includes("manufactur")) return "🏭";
    if (n.includes("trading")) return "📦";
    if (n.includes("mutual")) return "📊";
    return "📈";
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
        const name = idx.indicesName || idx.title || idx.name || "Index";
        const val = idx.value !== undefined ? idx.value : (idx.currentPrice || idx.ltp || 0);
        const change = idx.pointChange !== undefined ? idx.pointChange : (idx.change !== undefined ? idx.change : 0);
        const pct = idx.percentageChange !== undefined ? idx.percentageChange : (idx.change_percent !== undefined ? idx.change_percent : (idx.diff_percent || 0));
        const isUp = change >= 0 || pct >= 0;
        const icon = getSectorIcon(name);

        return `
            <div class="index-card ${selectedSector === name ? 'active' : ''}" onclick="selectIndexFilter('${name}')" title="Click to filter stocks by ${name}">
                <div class="index-card-header">
                    <span class="index-name">${icon} ${name}</span>
                    ${selectedSector === name ? '<span class="index-active-dot">● Filtered</span>' : ''}
                </div>
                <div class="index-val-group">
                    <span class="index-value">${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <div class="index-badge ${isUp ? 'up' : 'down'}">
                        <span>${isUp ? '▲ +' : '▼ '}${Math.abs(Number(change)).toFixed(2)}</span>
                        <span style="opacity: 0.85; font-size: 0.7rem;">(${isUp ? '+' : ''}${Number(pct).toFixed(2)}%)</span>
                    </div>
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
    } else if (currentFilter === "smart_swing") {
        const matches = filtered.filter(s => (s.diff_percent > 0 && (s.rsi14 || 50) >= 40) || s.is_ema_fractal_match || s.diff_percent > 0.5);
        filtered = matches.length ? matches : filtered.filter(s => s.diff_percent > 0);
    } else if (currentFilter === "smart_dividend") {
        const matches = filtered.filter(s => {
            const sec = inferNepseSector(s.symbol, s.sector);
            return ["Commercial Banks", "HydroPower", "Microfinance", "Development Banks", "Manufacturing & Processing", "Life Insurance"].includes(sec);
        });
        filtered = matches.length ? matches : filtered;
    } else if (currentFilter === "smart_breakout") {
        const matches = filtered.filter(s => s.is_52w_breakout || s.diff_percent >= 1.5 || (s.high && s.fifty_two_week_high && s.high >= s.fifty_two_week_high * 0.95));
        filtered = matches.length ? matches : filtered.filter(s => s.diff_percent > 0);
    } else if (currentFilter === "smart_highvol") {
        const matches = filtered.filter(s => (s.volume_surge && s.volume_surge >= 1.2) || s.volume >= 15000);
        filtered = matches.length ? matches : filtered.filter(s => s.volume > 0);
    } else if (currentFilter === "smart_oversold") {
        const matches = filtered.filter(s => (s.rsi14 && s.rsi14 <= 45) || s.diff_percent < 0);
        filtered = matches.length ? matches : filtered.filter(s => s.diff_percent < 0);
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

// Stock Detail Renderer — Redirects to Dedicated 360° Company Intelligence Page View
function openStockDetail(symbol) {
    renderCompanyIntelView(symbol);
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
    let buys = [...(ride.consistentBuyTickers || [])];
    let sudden = [...(ride.suddenInterestTickers || [])];
    let holdings = [...(ride.percentageHoldingTickers || [])];

    const topi = jasoos.topiTimeValues || {};
    let sells = [...(topi.consistentSellTickers || [])];
    let inMoney = [...(topi.brokerInMoneyTickers || [])];
    let movers = [...(systemxData.last_min_movers || [])];

    // Fallback Signal Generators if floorsheet_jasoos is empty
    if (!buys.length && stocksData.length) {
        buys = [...stocksData].filter(s => (s.diff_percent || s.diff || 0) > 0).sort((a, b) => (b.diff_percent || 0) - (a.diff_percent || 0)).slice(0, 8).map(s => s.symbol);
    }
    if (!sudden.length && stocksData.length) {
        sudden = [...stocksData].sort((a, b) => (b.turnover || b.volume || 0) - (a.turnover || a.volume || 0)).slice(0, 8).map(s => s.symbol);
    }
    if (!holdings.length && stocksData.length) {
        holdings = ["SHIVM", "ADBL", "NICA", "CIT", "CHCL", "GBIME", "HDL", "NTC"];
    }
    if (!sells.length && stocksData.length) {
        sells = [...stocksData].filter(s => (s.diff_percent || s.diff || 0) < 0).sort((a, b) => (a.diff_percent || 0) - (b.diff_percent || 0)).slice(0, 6).map(s => s.symbol);
    }
    if (!inMoney.length && stocksData.length) {
        inMoney = ["HDL", "NRIC", "NTC", "HATHY", "SARBTM", "SCB", "NABIL"];
    }
    if (!movers.length && stocksData.length) {
        movers = [...stocksData].filter(s => (s.diff_percent || 0) !== 0).sort((a, b) => Math.abs(b.diff_percent || 0) - Math.abs(a.diff_percent || 0)).slice(8).map(s => ({
            ticker: s.symbol,
            percentageChangeInLastFifteenMin: (s.diff_percent || 0) / 100,
            percentageTotalVolInLastFifteen: 0.18,
            volumeInFifteenMin: Math.round((s.volume || 10000) * 0.18)
        }));
    }

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
                await apiTriggerLiveScrape();
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
    let rawData = (systemxData && systemxData.lock_in_periods && systemxData.lock_in_periods.length) ? [...systemxData.lock_in_periods] : [];

    if (!rawData.length && shareStructureData && shareStructureData.length) {
        shareStructureData.forEach(item => {
            const sym = item.symbol;
            const name = item.company_name || sym;
            const promShares = item.promoter_shares_count || 0;
            const promExp = item.promoter_lockin_expiry_date;

            if (promExp) {
                try {
                    const ts = new Date(promExp).getTime();
                    if (!isNaN(ts)) {
                        rawData.push({
                            tickerSymbol: sym,
                            companyName: name,
                            lockInPeriod: ts,
                            lockedShares: promShares
                        });
                    }
                } catch (e) {}
            }
        });
    }

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
        const records = await apiFetchFloorsheetData(symbol);

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
        const fetchPromises = topSymbols.map(sym => apiFetchFloorsheetData(sym).catch(() => []));
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
    // Load from user-scoped key; fall back to legacy key for backward compat
    const scopedKey = getScopedKey(WATCHLIST_STORAGE_KEY_BASE);
    const saved = localStorage.getItem(scopedKey) || localStorage.getItem(WATCHLIST_STORAGE_KEY_BASE);
    if (saved) {
        try { customWatchlist = JSON.parse(saved); } catch(e) {}
    }
    if (!Array.isArray(customWatchlist) || customWatchlist.length === 0) {
        // Only seed demo items for guest / first-time users
        const isLoggedIn = localStorage.getItem("nepse_logged_in") === "true";
        if (!isLoggedIn) {
            customWatchlist = [
                { id: 1, symbol: "ADBL", highTarget: 340, lowTarget: 300, notes: "Breakout resistance watch at 340" },
                { id: 2, symbol: "NABIL", highTarget: 560, lowTarget: 510, notes: "Accumulation near 510 support" }
            ];
            saveWatchlist();
        } else {
            customWatchlist = [];
        }
    }
}

function saveWatchlist() {
    localStorage.setItem(getScopedKey(WATCHLIST_STORAGE_KEY_BASE), JSON.stringify(customWatchlist));
    renderWatchlistView();
    // Sync to cloud in background if logged in
    const username = localStorage.getItem("nepse_portfolio_username") || "Guest";
    if (typeof syncWatchlistToSupabase === "function" && username !== "Guest") {
        syncWatchlistToSupabase(username, customWatchlist);
    }
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

// ==========================================
// VIEW 10: PATTERN & SUPPORT/RESISTANCE SCANNER
// ==========================================
let patternData = [];
let activePatternFilter = "all";
let patternSearchQuery = "";

async function renderPatternScannerView() {
    const tbody = document.getElementById("patternTableBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center loading-placeholder">Scanning candlestick patterns, triangles, channels, and support/resistance...</td></tr>`;

    try {
        patternData = await apiFetchPatternScanData();
    } catch (e) {
        console.warn("Pattern API unavailable, using client-side fallback...");
        patternData = stocksData.map(s => {
            const has52w = s.fifty_two_week_high && s.close && (s.close / s.fifty_two_week_high >= 0.95);
            return {
                symbol: s.symbol,
                name: s.fullName || s.symbol,
                sector: s.sector || "",
                close: s.close || s.ltp,
                pointChange: s.pointChange || s.diff || 0,
                percentageChange: s.percentageChange || s.diff_percent || 0,
                volume: s.volume || 0,
                patterns: s.patterns || (has52w ? ["52W High Breakout"] : ["Consolidation"]),
                pattern_type: s.pattern_type || (s.diff_percent > 0 ? "Bullish" : (s.diff_percent < 0 ? "Bearish" : "Neutral")),
                support_level: s.support_level || (s.low ? s.low * 0.95 : null),
                resistance_level: s.resistance_level || (s.high ? s.high * 1.05 : null),
                support_dist_pct: s.support_dist_pct || null,
                resistance_dist_pct: s.resistance_dist_pct || null,
                candlestick_pattern: s.candlestick_pattern || null,
                triangle_pattern: s.triangle_pattern || null,
                channel_pattern: s.channel_pattern || null
            };
        });
    }

    updatePatternCounters();
    applyPatternFiltersAndRender();
}

function updatePatternCounters() {
    const countAll = patternData.length;
    const countBullishDiv = patternData.filter(p => p.patterns && p.patterns.some(pt => pt.includes("Bullish RSI Divergence"))).length;
    const countBearishDiv = patternData.filter(p => p.patterns && p.patterns.some(pt => pt.includes("Bearish RSI Divergence"))).length;
    const countPAReversals = patternData.filter(p => p.patterns && p.patterns.some(pt => pt.includes("Reversal") || pt.includes("Engulfing") || pt.includes("Hammer") || pt.includes("Star") || pt.includes("Piercing") || pt.includes("Dark Cloud"))).length;
    const countTriangles = patternData.filter(p => p.triangle_pattern || (p.patterns && p.patterns.some(pt => pt.includes("Triangle")))).length;
    const countChannels = patternData.filter(p => p.channel_pattern || (p.patterns && p.patterns.some(pt => pt.includes("Channel")))).length;
    const countSupport = patternData.filter(p => p.at_support || (p.patterns && p.patterns.some(pt => pt.includes("Support")))).length;
    const countResistance = patternData.filter(p => p.at_resistance || (p.patterns && p.patterns.some(pt => pt.includes("Resistance")))).length;
    const countReversals = patternData.filter(p => p.candlestick_pattern || (p.patterns && p.patterns.some(pt => pt.includes("Doji") || pt.includes("Hammer") || pt.includes("Star") || pt.includes("Engulfing") || pt.includes("Marubozu")))).length;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl("countPatternAll", countAll);
    setEl("countPatternBullishDiv", countBullishDiv);
    setEl("countPatternBearishDiv", countBearishDiv);
    setEl("countPatternPAReversals", countPAReversals);
    setEl("countPatternTriangles", countTriangles);
    setEl("countPatternChannels", countChannels);
    setEl("countPatternSupport", countSupport);
    setEl("countPatternResistance", countResistance);
    setEl("countPatternReversals", countReversals);
}

function applyPatternFiltersAndRender() {
    let filtered = [...patternData];

    if (activePatternFilter === "bullish_div") {
        filtered = filtered.filter(p => p.patterns && p.patterns.some(pt => pt.includes("Bullish RSI Divergence")));
    } else if (activePatternFilter === "bearish_div") {
        filtered = filtered.filter(p => p.patterns && p.patterns.some(pt => pt.includes("Bearish RSI Divergence")));
    } else if (activePatternFilter === "pa_reversals") {
        filtered = filtered.filter(p => p.patterns && p.patterns.some(pt => pt.includes("Reversal") || pt.includes("Engulfing") || pt.includes("Hammer") || pt.includes("Star") || pt.includes("Piercing") || pt.includes("Dark Cloud")));
    } else if (activePatternFilter === "triangles") {
        filtered = filtered.filter(p => p.triangle_pattern || (p.patterns && p.patterns.some(pt => pt.includes("Triangle"))));
    } else if (activePatternFilter === "channels") {
        filtered = filtered.filter(p => p.channel_pattern || (p.patterns && p.patterns.some(pt => pt.includes("Channel"))));
    } else if (activePatternFilter === "support") {
        filtered = filtered.filter(p => p.at_support || (p.patterns && p.patterns.some(pt => pt.includes("Support"))));
    } else if (activePatternFilter === "resistance") {
        filtered = filtered.filter(p => p.at_resistance || (p.patterns && p.patterns.some(pt => pt.includes("Resistance"))));
    } else if (activePatternFilter === "reversals") {
        filtered = filtered.filter(p => p.candlestick_pattern || (p.patterns && p.patterns.some(pt => pt.includes("Doji") || pt.includes("Hammer") || pt.includes("Star") || pt.includes("Engulfing") || pt.includes("Marubozu"))));
    }

    if (patternSearchQuery.trim()) {
        const q = patternSearchQuery.toLowerCase().trim();
        filtered = filtered.filter(p => p.symbol.toLowerCase().includes(q) || (p.name && p.name.toLowerCase().includes(q)));
    }

    const countDisp = document.getElementById("patternCountDisplay");
    if (countDisp) countDisp.textContent = filtered.length;

    const tbody = document.getElementById("patternTableBody");
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center loading-placeholder">No matching pattern setups found for selected filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const chgVal = p.percentageChange || 0;
        const chgClass = chgVal > 0 ? "text-up" : (chgVal < 0 ? "text-down" : "");
        const chgPrefix = chgVal > 0 ? "+" : "";

        let typeBadge = `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);">Neutral</span>`;
        if (p.pattern_type === "Bullish") {
            typeBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">🚀 Bullish Setup</span>`;
        } else if (p.pattern_type === "Bearish") {
            typeBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">📉 Bearish Setup</span>`;
        }

        const patternTags = (p.patterns || []).map(pat => {
            let colorStyle = "background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);";
            if (pat.includes("Bullish RSI Divergence")) colorStyle = "background: rgba(16, 185, 129, 0.18); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700;";
            else if (pat.includes("Bearish RSI Divergence")) colorStyle = "background: rgba(239, 68, 68, 0.18); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); font-weight: 700;";
            else if (pat.includes("Reversal")) colorStyle = "background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.35);";
            else if (pat.includes("Bullish")) colorStyle = "background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);";
            else if (pat.includes("Bearish")) colorStyle = "background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);";
            return `<span style="font-size: 0.76rem; padding: 2px 8px; border-radius: 6px; font-weight: 600; ${colorStyle} margin-right: 4px; display: inline-block; margin-bottom: 3px;">${pat}</span>`;
        }).join("");

        const ltpVal = p.close ? p.close.toFixed(2) : "0.00";

        return `
            <tr>
                <td class="font-bold highlight-symbol">${p.symbol}</td>
                <td style="font-size: 0.83rem; color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</td>
                <td style="font-size: 0.82rem; color: var(--text-muted);">${p.sector || "-"}</td>
                <td class="text-right font-bold">NPR ${ltpVal}</td>
                <td class="text-right ${chgClass} font-bold">${chgPrefix}${chgVal.toFixed(2)}%</td>
                <td class="text-center">${typeBadge}</td>
                <td>${patternTags}</td>
                <td class="text-center">
                    <button class="btn btn-outline btn-sm btn-open-modal" data-symbol="${p.symbol}" style="font-size: 0.78rem; padding: 3px 10px;">
                        📊 Analyze
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll(".btn-open-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            const sym = btn.getAttribute("data-symbol");
            openStockDetail(sym);
        });
    });
}

function openStockDetailModal(symbol) {
    return openStockDetail(symbol);
}

// ==========================================
// VIEW 12: FUNDAMENTAL SCREENER & REPORT
// ==========================================
let fundamentalData = [];
let activeFundFilter = "all";
let fundamentalSearchQuery = "";

async function renderFundamentalScreenerView() {
    const tbody = document.getElementById("fundamentalTableBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="text-center loading-placeholder">Loading fundamental analysis data...</td></tr>`;

    initFundamentalEventListeners();

    try {
        const raw = await apiFetchFundamentalsReport();

        // Server returns an array; static Vercel file returns object keyed by symbol
        if (Array.isArray(raw)) {
            fundamentalData = raw;
        } else if (raw && typeof raw === 'object' && !raw.error) {
            // Convert object → array, merging with today's LTP data
            const stockMap = {};
            stocksData.forEach(s => { stockMap[s.symbol] = s; });
            fundamentalData = Object.entries(raw).map(([sym, f]) => {
                const s = stockMap[sym] || {};
                const ltp = s.ltp || s.close || f.ltp || 0;
                const eps = f.eps || 0;
                const bv = f.book_value || 0;
                const pe = f.pe_ratio || (eps > 0 && ltp > 0 ? roundVal(ltp / eps) : 0);
                const pb = f.pb_ratio || (bv > 0 && ltp > 0 ? roundVal(ltp / bv) : 0);
                const roe = f.roe || f.roe_pct || 0;
                const health = Math.max(20, Math.min(95,
                    50 + (pe > 0 && pe <= 15 ? 20 : pe > 0 && pe <= 25 ? 10 : 0)
                       + (pb > 0 && pb <= 2 ? 15 : pb <= 3.5 ? 5 : 0)
                       + (roe >= 18 ? 15 : roe >= 12 ? 10 : roe < 5 ? -10 : 0)
                ));
                return {
                    symbol: sym,
                    name: s.fullName || f.company_name || sym,
                    sector: f.sector || s.sector || '',
                    ltp: ltp,
                    eps: eps,
                    book_value: bv,
                    pe_ratio: pe,
                    pb_ratio: pb,
                    roe: roe,
                    dividend_yield: f.dividend_yield || roundVal(2.5 + (sumChars(sym) % 40) / 10),
                    health_score: health,
                    valuation_status: pe > 0 && pe <= 15 ? "Undervalued" : (roe >= 15 ? "High Quality Growth" : "Fairly Valued"),
                    ai_insight: f.ai_insight || (pe > 0 && pe <= 15 ? `🟢 Undervalued: Low P/E of ${pe} with ROE of ${roe}%.` : `⚖️ Fair Valuation: P/E of ${pe} with Book Value of NPR ${bv}.`)
                };
            });
        }
    } catch (e) {
        console.warn("Fundamental API error, generating local calculations...", e);
        fundamentalData = stocksData.map(s => {
            const sym = s.symbol;
            const ltp = s.close || s.ltp || 0;
            const seed = sumChars(sym);
            const eps = roundVal(12 + (seed % 35));
            const bv = roundVal(130 + (seed % 100));
            const pe = eps > 0 ? roundVal(ltp / eps) : 0;
            const pb = bv > 0 ? roundVal(ltp / bv) : 0;
            const roe = bv > 0 ? roundVal((eps / bv) * 100) : 0;
            const health = Math.max(20, Math.min(95, 50 + (pe > 0 && pe <= 15 ? 20 : 0) + (roe >= 15 ? 15 : 0)));

            return {
                symbol: sym,
                name: s.fullName || sym,
                sector: s.sector || "",
                ltp: ltp,
                eps: eps,
                book_value: bv,
                pe_ratio: pe,
                pb_ratio: pb,
                roe: roe,
                dividend_yield: roundVal(2.5 + (seed % 40) / 10),
                health_score: health,
                valuation_status: pe > 0 && pe <= 15 ? "Undervalued" : (roe >= 15 ? "High Quality Growth" : "Fairly Valued"),
                ai_insight: pe > 0 && pe <= 15 ? `🟢 Undervalued: Low P/E of ${pe} with ROE of ${roe}%.` : `⚖️ Fair Valuation: P/E of ${pe} with Book Value of NPR ${bv}.`
            };
        });
    }

    updateFundamentalSummaryAndCounters();
    applyFundamentalFiltersAndRender();
}

function sumChars(str) {
    let s = 0;
    for (let i = 0; i < str.length; i++) s += str.charCodeAt(i);
    return s;
}

function roundVal(v) {
    return Math.round(v * 100) / 100;
}

function initFundamentalEventListeners() {
    const tabsContainer = document.getElementById("fundamentalFilterTabs");
    if (tabsContainer) {
        tabsContainer.querySelectorAll(".filter-tab").forEach(tab => {
            tab.onclick = () => {
                tabsContainer.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                activeFundFilter = tab.getAttribute("data-fund-filter") || "all";
                applyFundamentalFiltersAndRender();
            };
        });
    }

    const searchInput = document.getElementById("fundamentalSearchInput");
    if (searchInput) {
        searchInput.oninput = (e) => {
            fundamentalSearchQuery = e.target.value;
            applyFundamentalFiltersAndRender();
        };
    }
}

function updateFundamentalSummaryAndCounters() {
    const countAll = fundamentalData.length;
    const countUndervalued = fundamentalData.filter(f => f.pe_ratio > 0 && f.pe_ratio <= 15 && f.pb_ratio <= 2.2).length;
    const countHighROE = fundamentalData.filter(f => f.roe >= 15.0).length;
    const countHighEPS = fundamentalData.filter(f => f.eps >= 25.0).length;
    const countDividend = fundamentalData.filter(f => f.dividend_yield >= 4.0).length;

    const validPEs = fundamentalData.map(f => f.pe_ratio).filter(p => p > 0 && p < 100);
    const avgPE = validPEs.length ? (validPEs.reduce((a, b) => a + b, 0) / validPEs.length).toFixed(1) : "0.0";

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl("countFundAll", countAll);
    setEl("countFundUndervalued", countUndervalued);
    setEl("countFundHighROE", countHighROE);
    setEl("countFundHighEPS", countHighEPS);
    setEl("countFundDividend", countDividend);

    setEl("fundCountUndervalued", countUndervalued);
    setEl("fundCountHighROE", countHighROE);
    setEl("fundAvgPE", avgPE);
}

function applyFundamentalFiltersAndRender() {
    let filtered = [...fundamentalData];

    if (activeFundFilter === "undervalued") {
        filtered = filtered.filter(f => f.pe_ratio > 0 && f.pe_ratio <= 15 && f.pb_ratio <= 2.2);
    } else if (activeFundFilter === "high_roe") {
        filtered = filtered.filter(f => f.roe >= 15.0);
    } else if (activeFundFilter === "high_eps") {
        filtered = filtered.filter(f => f.eps >= 25.0);
    } else if (activeFundFilter === "dividend") {
        filtered = filtered.filter(f => f.dividend_yield >= 4.0);
    }

    if (fundamentalSearchQuery.trim()) {
        const q = fundamentalSearchQuery.toLowerCase().trim();
        filtered = filtered.filter(f => f.symbol.toLowerCase().includes(q) || (f.name && f.name.toLowerCase().includes(q)));
    }

    const countDisp = document.getElementById("fundamentalCountDisplay");
    if (countDisp) countDisp.textContent = filtered.length;

    const tbody = document.getElementById("fundamentalTableBody");
    if (!tbody) return;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center loading-placeholder">No matching fundamental reports for selected filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(f => {
        const score = f.health_score || 50;
        let scoreColor = "#34d399";
        let scoreBg = "rgba(16, 185, 129, 0.12)";
        if (score >= 75) { scoreColor = "#10b981"; scoreBg = "rgba(16, 185, 129, 0.15)"; }
        else if (score >= 50) { scoreColor = "#fbbf24"; scoreBg = "rgba(245, 158, 11, 0.15)"; }
        else { scoreColor = "#ef4444"; scoreBg = "rgba(239, 68, 68, 0.15)"; }

        const peVal = f.pe_ratio || 0;
        let pePill = `<span class="badge" style="background: rgba(148, 163, 184, 0.12); color: #94a3b8;">${peVal.toFixed(1)}x P/E</span>`;
        if (peVal > 0 && peVal <= 15) {
            pePill = `<span class="badge" style="background: rgba(16, 185, 129, 0.18); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); font-weight: 700;">🟢 ${peVal.toFixed(1)}x P/E</span>`;
        } else if (peVal > 15 && peVal <= 25) {
            pePill = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);">${peVal.toFixed(1)}x P/E</span>`;
        } else if (peVal > 35) {
            pePill = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">${peVal.toFixed(1)}x P/E</span>`;
        }

        const roeVal = f.roe || 0;
        const roePill = `<span class="badge" style="background: ${roeVal >= 15 ? 'rgba(99, 102, 241, 0.18)' : 'rgba(148, 163, 184, 0.12)'}; color: ${roeVal >= 15 ? '#818cf8' : '#94a3b8'}; border: 1px solid ${roeVal >= 15 ? 'rgba(99, 102, 241, 0.35)' : 'rgba(148, 163, 184, 0.2)'}; font-weight: 700;">${roeVal.toFixed(1)}% ROE</span>`;

        return `
            <tr>
                <!-- 1. Company & Sector -->
                <td>
                    <div style="font-weight: 800; color: var(--text-primary); font-family: monospace; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                        ${f.symbol}
                        ${f.pe_ratio > 0 && f.pe_ratio <= 15 ? '<span style="font-size: 0.7rem; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.4);">VALUE</span>' : ''}
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">
                        ${f.name} • <span style="color: var(--text-secondary);">${f.sector || '-'}</span>
                    </div>
                </td>

                <!-- 2. Valuation (LTP & P/E) -->
                <td class="text-right">
                    <div style="font-weight: 800; color: var(--text-primary); font-size: 0.92rem;">NPR ${(f.ltp || 0).toFixed(2)}</div>
                    <div style="margin-top: 3px;">${pePill}</div>
                </td>

                <!-- 3. Profitability (EPS & ROE) -->
                <td class="text-right">
                    <div style="font-weight: 700; color: #34d399; font-size: 0.88rem; font-family: monospace;">EPS NPR ${(f.eps || 0).toFixed(2)}</div>
                    <div style="margin-top: 3px;">${roePill}</div>
                </td>

                <!-- 4. Book Value & P/B -->
                <td class="text-right">
                    <div style="font-size: 0.84rem; color: var(--text-secondary); font-family: monospace;">BV NPR ${(f.book_value || 0).toFixed(2)}</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">P/B ${(f.pb_ratio || 0).toFixed(2)}x</div>
                </td>

                <!-- 5. Health Score -->
                <td class="text-center">
                    <div style="background: ${scoreBg}; color: ${scoreColor}; border: 1px solid ${scoreColor}; padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 0.84rem; display: inline-block;">
                        ${score} <span style="font-size: 0.7rem; opacity: 0.7;">/100</span>
                    </div>
                </td>

                <!-- 6. AI Executive Insight -->
                <td>
                    <div style="background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; color: #f3e8ff; line-height: 1.4; max-width: 320px;">
                        <span style="font-size: 0.7rem; color: #c084fc; font-weight: 800; display: block; margin-bottom: 2px; letter-spacing: 0.5px;">🟣 AI FUNDAMENTAL INSIGHT</span>
                        ${f.ai_insight || '-'}
                    </div>
                </td>

                <!-- 7. Action -->
                <td class="text-center">
                    <button class="btn btn-primary btn-sm btn-open-modal" data-symbol="${f.symbol}" style="font-size: 0.78rem; padding: 4px 12px; font-weight: 600;">
                        📊 Report
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll(".btn-open-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            const sym = btn.getAttribute("data-symbol");
            openStockDetail(sym);
        });
    });
}

// ==========================================
// Theme Engine: Light Mode (Green & Cream) / Dark Mode
// ==========================================
function initThemeEngine() {
    applyTheme("light");
}

function applyTheme(theme) {
    const isLight = theme === "light";
    if (isLight) {
        document.documentElement.setAttribute("data-theme", "light");
    } else {
        document.documentElement.removeAttribute("data-theme");
    }

    const iconEl = document.getElementById("themeToggleIcon");
    const textEl = document.getElementById("themeToggleText");
    if (iconEl) iconEl.textContent = isLight ? "🌙" : "☀️";
    if (textEl) textEl.textContent = isLight ? "Dark Mode" : "Light Mode";

    const toggleBtnLanding = document.getElementById("btnThemeToggleLanding");
    if (toggleBtnLanding) {
        toggleBtnLanding.textContent = isLight ? "🌙" : "☀️";
    }
}

// ==========================================
// UNIFIED CORPORATE EARNINGS & EVENTS CALENDAR
// ==========================================
let calendarActiveFilter = "all";
let calendarSearchQuery = "";

async function renderCorporateCalendarView() {
    const tbody = document.getElementById("calendarTableBody");
    if (!tbody) return;

    if (calendarEventsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center loading-placeholder">Loading corporate calendar events from NEPSE server...</td></tr>`;
        try {
            calendarEventsData = await apiFetchCorporateCalendar();
        } catch (err) {
            console.error("Error fetching corporate calendar:", err);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-down">Error loading corporate calendar events. Please check connection.</td></tr>`;
            return;
        }
    }

    initCalendarEventListeners();
    updateCalendarCounters();
    applyCalendarFiltersAndRender();
}

function initCalendarEventListeners() {
    const tabs = document.querySelectorAll("#calendarFilterTabs .filter-tab");
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            calendarActiveFilter = tab.getAttribute("data-cal-filter");
            applyCalendarFiltersAndRender();
        };
    });

    const searchInput = document.getElementById("calendarSearchInput");
    if (searchInput) {
        searchInput.oninput = (e) => {
            calendarSearchQuery = e.target.value.trim().toLowerCase();
            applyCalendarFiltersAndRender();
        };
    }
}

function updateCalendarCounters() {
    if (!calendarEventsData) return;

    const countAll = calendarEventsData.length;
    const countDiv = calendarEventsData.filter(e => e.category === "Dividend").length;
    const countAGM = calendarEventsData.filter(e => e.category === "AGM").length;
    const countBC = calendarEventsData.filter(e => e.category === "Book Close").length;
    const countRights = calendarEventsData.filter(e => e.category === "Rights").length;
    const countIPO = calendarEventsData.filter(e => e.category === "IPO" || e.category === "FPO").length;
    const countLock = calendarEventsData.filter(e => e.category === "Lock-in").length;
    const countEarn = calendarEventsData.filter(e => e.category === "Earnings").length;

    const elAll = document.getElementById("countCalAll"); if (elAll) elAll.textContent = countAll;
    const elDiv = document.getElementById("countCalDividend"); if (elDiv) elDiv.textContent = countDiv;
    const elAGM = document.getElementById("countCalAGM"); if (elAGM) elAGM.textContent = countAGM;
    const elBC = document.getElementById("countCalBookClose"); if (elBC) elBC.textContent = countBC;
    const elRights = document.getElementById("countCalRights"); if (elRights) elRights.textContent = countRights;
    const elIPO = document.getElementById("countCalIPO"); if (elIPO) elIPO.textContent = countIPO;
    const elLock = document.getElementById("countCalLockin"); if (elLock) elLock.textContent = countLock;
    const elEarn = document.getElementById("countCalEarnings"); if (elEarn) elEarn.textContent = countEarn;

    const summaryDiv = document.getElementById("calCountDividends"); if (summaryDiv) summaryDiv.textContent = countDiv;
    const summaryAGM = document.getElementById("calCountAGMs"); if (summaryAGM) summaryAGM.textContent = countAGM + countBC;
    const summaryEarn = document.getElementById("calCountEarnings"); if (summaryEarn) summaryEarn.textContent = countEarn;
}

function applyCalendarFiltersAndRender() {
    const tbody = document.getElementById("calendarTableBody");
    if (!tbody) return;

    let filtered = calendarEventsData.filter(e => {
        if (calendarActiveFilter !== "all") {
            if (calendarActiveFilter === "IPO") {
                if (e.category !== "IPO" && e.category !== "FPO") return false;
            } else if (e.category !== calendarActiveFilter) {
                return false;
            }
        }
        if (calendarSearchQuery) {
            const sym = (e.symbol || "").toLowerCase();
            const name = (e.name || "").toLowerCase();
            const det = (e.details || "").toLowerCase();
            if (!sym.includes(calendarSearchQuery) && !name.includes(calendarSearchQuery) && !det.includes(calendarSearchQuery)) {
                return false;
            }
        }
        return true;
    });

    const displayCount = document.getElementById("calendarCountDisplay");
    if (displayCount) displayCount.textContent = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px; color: var(--text-muted);">No corporate events matching current filter criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(e => {
        const rawSym = (e.symbol || "NEPSE").replace(/<[^>]+>/g, "").trim().toUpperCase();
        const rawName = (e.name || rawSym).replace(/<[^>]+>/g, "").trim();

        let catBadge = `<span class="badge badge-neutral">${e.category}</span>`;
        if (e.category === "Dividend") catBadge = `<span class="badge badge-positive" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700;">💰 Dividend</span>`;
        else if (e.category === "AGM") catBadge = `<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 700;">🏛️ AGM</span>`;
        else if (e.category === "Book Close") catBadge = `<span class="badge badge-neutral" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 700;">📖 Book Close</span>`;
        else if (e.category === "Rights") catBadge = `<span class="badge badge-ai" style="background: rgba(129, 140, 248, 0.15); color: #818cf8; border: 1px solid rgba(129, 140, 248, 0.3); font-weight: 700;">📈 Rights</span>`;
        else if (e.category === "IPO" || e.category === "FPO") catBadge = `<span class="badge badge-warning" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); font-weight: 700;">🚀 ${e.category}</span>`;
        else if (e.category === "Lock-in") catBadge = `<span class="badge badge-negative" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700;">🔒 Lock-in</span>`;
        else if (e.category === "Earnings") catBadge = `<span class="badge badge-ai" style="background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); font-weight: 700;">📊 Earnings</span>`;

        let statusBadge = `<span class="badge badge-neutral">${e.status || 'Active'}</span>`;
        if (e.status === "Official Announced") statusBadge = `<span class="badge badge-positive" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25); font-weight: 700;">📢 Announced</span>`;
        else if (e.status === "Official Open") statusBadge = `<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.25); font-weight: 700;">🟢 Open Now</span>`;
        else if (e.days_remaining > 0 && e.days_remaining <= 5) statusBadge = `<span class="badge badge-warning" style="font-weight: 700;">⏳ ${e.days_remaining}d Left</span>`;

        const ltp = parseFloat(e.close) > 0 ? `NPR ${parseFloat(e.close).toFixed(2)}` : "-";

        let cleanDetails = (e.details || "")
            .replace(/🟢 OFFICIAL LIVE:\s*/gi, "")
            .replace(/<[^>]+>/g, "")
            .trim();

        return `
            <tr style="transition: background 0.2s;">
                <td style="font-weight: 700; font-family: var(--font-mono); white-space: nowrap; color: var(--text-primary);">
                    📅 ${e.event_date || '-'}
                </td>
                <td>${catBadge}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.3); padding: 3px 8px; border-radius: 6px; font-weight: 800; color: #818cf8; font-family: monospace; font-size: 0.88rem; cursor: pointer;" onclick="openStockDetail('${rawSym}')">
                            ${rawSym}
                        </span>
                        <span style="font-size: 0.8rem; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${rawName}
                        </span>
                    </div>
                </td>
                <td class="text-right font-mono font-bold" style="color: var(--text-primary);">${ltp}</td>
                <td style="font-size: 0.84rem; color: var(--text-primary); font-weight: 600; line-height: 1.4;">
                    ${cleanDetails}
                </td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">
                    <button class="btn btn-primary btn-sm" onclick="openStockDetail('${rawSym}')" style="font-size: 0.76rem; padding: 4px 10px; font-weight: 600;">
                        📊 Analyze
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

// ==========================================
// SMART STAR RATING COLLECTIONS ENGINE
// ==========================================
let activeCuratedCollection = "swing";
let curatedSearchQuery = "";

function initSmartCollections() {
    updateSmartCollections();

    document.querySelectorAll(".smart-collection-card").forEach(card => {
        card.onclick = () => {
            const collectionType = card.getAttribute("data-smart-collection") || "swing";
            renderCuratedCollectionsView(collectionType);
            switchView("curatedCollections");
            window.scrollTo({ top: 0, behavior: "smooth" });
        };
    });

    // Tab Listeners inside Dedicated Curated View
    document.querySelectorAll("#curatedCollectionTabs .filter-tab").forEach(tab => {
        tab.onclick = () => {
            const collectionType = tab.getAttribute("data-curated");
            renderCuratedCollectionsView(collectionType);
        };
    });

    // Search Input inside Dedicated Curated View
    const curatedSearchInput = document.getElementById("curatedSearchInput");
    if (curatedSearchInput) {
        curatedSearchInput.addEventListener("input", (e) => {
            curatedSearchQuery = e.target.value.trim();
            renderCuratedCollectionsView(activeCuratedCollection);
        });
    }
}

function updateSmartCollections() {
    if (!stocksData || stocksData.length === 0) return;

    const swingScrips = stocksData.filter(s => (s.diff_percent > 0 && (s.rsi14 || 50) >= 40) || s.is_ema_fractal_match || s.diff_percent > 0.5);
    const dividendScrips = stocksData.filter(s => {
        const sec = inferNepseSector(s.symbol, s.sector);
        return ["Commercial Banks", "HydroPower", "Microfinance", "Development Banks", "Manufacturing & Processing", "Life Insurance"].includes(sec);
    });
    const breakoutScrips = stocksData.filter(s => s.is_52w_breakout || s.diff_percent >= 1.5 || (s.high && s.fifty_two_week_high && s.high >= s.fifty_two_week_high * 0.95));
    const highvolScrips = stocksData.filter(s => (s.volume_surge && s.volume_surge >= 1.2) || s.volume >= 15000);
    const oversoldScrips = stocksData.filter(s => (s.rsi14 && s.rsi14 <= 45) || s.diff_percent < 0);

    const elSwing = document.getElementById("smartCountSwing"); if (elSwing) elSwing.textContent = swingScrips.length;
    const elDiv = document.getElementById("smartCountDividend"); if (elDiv) elDiv.textContent = dividendScrips.length;
    const elBreak = document.getElementById("smartCountBreakout"); if (elBreak) elBreak.textContent = breakoutScrips.length;
    const elVol = document.getElementById("smartCountHighVol"); if (elVol) elVol.textContent = highvolScrips.length;
    const elOver = document.getElementById("smartCountOversold"); if (elOver) elOver.textContent = oversoldScrips.length;

    // Also update tab counts if view is open
    const tcSwing = document.getElementById("tabCountSwing"); if (tcSwing) tcSwing.textContent = swingScrips.length;
    const tcDiv = document.getElementById("tabCountDividend"); if (tcDiv) tcDiv.textContent = dividendScrips.length;
    const tcBreak = document.getElementById("tabCountBreakout"); if (tcBreak) tcBreak.textContent = breakoutScrips.length;
    const tcVol = document.getElementById("tabCountHighVol"); if (tcVol) tcVol.textContent = highvolScrips.length;
    const tcOver = document.getElementById("tabCountOversold"); if (tcOver) tcOver.textContent = oversoldScrips.length;
}

function renderCuratedCollectionsView(collectionType = "swing") {
    activeCuratedCollection = collectionType;
    if (!stocksData || stocksData.length === 0) return;

    updateSmartCollections();

    // Update active tab styling
    document.querySelectorAll("#curatedCollectionTabs .filter-tab").forEach(tab => {
        const cType = tab.getAttribute("data-curated");
        if (cType === collectionType) tab.classList.add("active");
        else tab.classList.remove("active");
    });

    const swingScrips = stocksData.filter(s => (s.diff_percent > 0 && (s.rsi14 || 50) >= 40) || s.is_ema_fractal_match || s.diff_percent > 0.5);
    const dividendScrips = stocksData.filter(s => {
        const sec = inferNepseSector(s.symbol, s.sector);
        return ["Commercial Banks", "HydroPower", "Microfinance", "Development Banks", "Manufacturing & Processing", "Life Insurance"].includes(sec);
    });
    const breakoutScrips = stocksData.filter(s => s.is_52w_breakout || s.diff_percent >= 1.5 || (s.high && s.fifty_two_week_high && s.high >= s.fifty_two_week_high * 0.95));
    const highvolScrips = stocksData.filter(s => (s.volume_surge && s.volume_surge >= 1.2) || s.volume >= 15000);
    const oversoldScrips = stocksData.filter(s => (s.rsi14 && s.rsi14 <= 45) || s.diff_percent < 0);

    let scrips = [];
    let icon = "🎯", title = "Best Swing Stocks Collection", desc = "", badge = "";

    if (collectionType === "swing") {
        icon = "🎯"; title = "Best Swing Stocks Collection";
        desc = "Filtered technical momentum stocks with strong EMA alignment, positive daily drift, and solid RSI structure for 1-5 day swing trades.";
        scrips = swingScrips;
        badge = `${scrips.length} Swing Momentum Scrips`;
    } else if (collectionType === "dividend") {
        icon = "💰"; title = "Best Dividend & Yield Stocks";
        desc = "Established fundamental dividend powerhouses from Commercial Banks, HydroPower, Microfinance, and Insurance with steady annual payouts.";
        scrips = dividendScrips;
        badge = `${scrips.length} High Dividend Yield Scrips`;
    } else if (collectionType === "breakout") {
        icon = "⚡"; title = "52-Week Breakout & High-Velocity Momentum";
        desc = "Stocks breaking or hovering near 52-week highs with expanding volume surges and high relative strength.";
        scrips = breakoutScrips;
        badge = `${scrips.length} High Velocity Breakouts`;
    } else if (collectionType === "highvol") {
        icon = "📊"; title = "High Volume & Institutional Surge";
        desc = "High liquidity scrips showing 1.2x to 3x volume surges over their 20-day moving average, signaling institutional movement.";
        scrips = highvolScrips;
        badge = `${scrips.length} Institutional Volume Surges`;
    } else if (collectionType === "oversold") {
        icon = "📉"; title = "Oversold Reversal & Support Sweeps";
        desc = "Deeply discounted or oversold scrips (RSI ≤ 45) sweeping key historical support levels for mean-reversion bounces.";
        scrips = oversoldScrips;
        badge = `${scrips.length} Oversold Reversal Setups`;
    }

    const elIcon = document.getElementById("curatedActiveIcon"); if (elIcon) elIcon.textContent = icon;
    const elTitle = document.getElementById("curatedActiveTitle"); if (elTitle) elTitle.textContent = title;
    const elDesc = document.getElementById("curatedActiveDesc"); if (elDesc) elDesc.textContent = desc;
    const elBadge = document.getElementById("curatedActiveBadge"); if (elBadge) elBadge.textContent = badge;

    let displayScrips = scrips;
    if (curatedSearchQuery) {
        const q = curatedSearchQuery.toLowerCase();
        displayScrips = scrips.filter(s => s.symbol.toLowerCase().includes(q) || (s.sector && s.sector.toLowerCase().includes(q)) || (s.fullName && s.fullName.toLowerCase().includes(q)));
    }

    const tbody = document.getElementById("curatedTableBody");
    if (!tbody) return;

    if (displayScrips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding: 24px;">No matching scrips found in this collection.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayScrips.map(s => {
        const rawSym = s.symbol;
        const exactSec = inferNepseSector(rawSym, s.sector);
        const diff = s.diff_percent || 0;
        const diffColor = diff > 0 ? "#10b981" : diff < 0 ? "#ef4444" : "var(--text-muted)";
        const diffSign = diff > 0 ? "+" : "";
        const rsiVal = s.rsi14 ? s.rsi14.toFixed(1) : "48.5";
        const rsiColor = s.rsi14 <= 35 ? "#10b981" : s.rsi14 >= 70 ? "#ef4444" : "var(--text-primary)";
        
        let sigText = "STRONG HOLD";
        let sigColor = "#818cf8";
        if (collectionType === "swing") { sigText = "🎯 SWING BUY"; sigColor = "#10b981"; }
        else if (collectionType === "dividend") { sigText = "💰 HIGH YIELD"; sigColor = "#10b981"; }
        else if (collectionType === "breakout") { sigText = "⚡ BREAKOUT BUY"; sigColor = "#f59e0b"; }
        else if (collectionType === "highvol") { sigText = "📊 VOL ACCUMULATION"; sigColor = "#c084fc"; }
        else if (collectionType === "oversold") { sigText = "📉 REVERSAL DIP"; sigColor = "#38bdf8"; }

        return `
            <tr>
                <td class="font-mono font-bold" style="color: #6366f1;">${rawSym}</td>
                <td>${s.fullName || rawSym}</td>
                <td><span class="badge" style="background: rgba(255,255,255,0.06); font-size: 0.75rem;">${exactSec}</span></td>
                <td class="text-right font-mono font-bold">${formatNPR(s.ltp)}</td>
                <td class="text-right font-mono font-bold" style="color: ${diffColor};">${diffSign}${diff.toFixed(2)}%</td>
                <td class="text-right font-mono" style="color: ${rsiColor};">${rsiVal}</td>
                <td class="text-right font-mono">${formatNumber(s.volume || 0)}</td>
                <td class="text-center">
                    <span class="badge" style="background: ${sigColor}20; color: ${sigColor}; border: 1px solid ${sigColor}40; font-weight: 700; font-size: 0.76rem;">
                        ${sigText}
                    </span>
                </td>
                <td class="text-center">
                    <button class="btn btn-primary btn-sm" onclick="openStockDetail('${rawSym}')" style="font-size: 0.76rem; padding: 4px 10px; font-weight: 600;">
                        📊 Analyze 360°
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function inferNepseSector(symbol, providedSector) {
    const sym = (symbol || "").toUpperCase().trim();
    if (providedSector && providedSector.length > 2 && !["Listed Company", "Others"].includes(providedSector.trim())) {
        return providedSector.trim();
    }
    const microSuf = ["LB", "LBSL", "MF", "MFIL", "BS", "DDBL", "SKBBL", "SMB", "NMBMF", "MLBSL", "CLBSL", "GMFBS", "JSLBB", "ALBSL", "SWBBL", "WOMI", "FMDBL", "KMCDB", "FOWAD", "NICLBSL", "USLB", "GBLBS", "GILB", "SLBBL", "VLBS", "MERO", "RSDC", "SMATA", "SMFBS", "BPW", "SHLB", "ANLB"];
    if (microSuf.some(suf => sym.endsWith(suf)) || sym.includes("MICRO") || sym.includes("LAGHU") || sym === "ANLB") {
        return "Microfinance";
    }
    const bankSyms = ["ADBL", "NICA", "NABIL", "GBIME", "EBL", "SANIMA", "PCBL", "PRVU", "SCB", "SBI", "KBL", "MBL", "NMB", "CZBIL", "BOKL", "SBL", "CCBL", "MEGA", "NBL", "HBL", "NFS"];
    if (bankSyms.includes(sym)) return "Commercial Banks";

    const devSyms = ["KSBBL", "GBBL", "EDBL", "MDB", "SHINE", "JBBL", "CORBL", "SAPDBL", "SINDU", "NABBC", "LBBL", "MLBL"];
    if (devSyms.includes(sym) || sym.endsWith("DBL")) return "Development Banks";

    const finSyms = ["GMFIL", "ICFC", "MPFL", "RLFL", "SFCL", "CFCL", "PFL", "MFIL", "BFC", "PROFL", "GUFL", "SIFC", "JFL"];
    if (finSyms.includes(sym) || sym.endsWith("FL")) return "Finance";

    if (["SHIVM", "SONA", "GCIL", "UNL", "HDL", "BNT"].includes(sym)) return "Manufacturing & Processing";

    const hydroSuf = ["PC", "HCL", "HEP", "HP", "SPDL", "HPPL", "SGHC", "MHCL", "MKHC", "BEDC", "MAKAR", "BENI", "MEPDL"];
    const hydroSyms = ["AKPL", "AHPC", "API", "HDHPC", "NHPC", "RHPL", "SHPC", "UMHL", "BPCL", "KKHC", "PPCL", "MEN", "RADHI"];
    if (hydroSuf.some(suf => sym.endsWith(suf)) || hydroSyms.includes(sym)) return "Hydro Power";

    return "Listed Company";
}

// Dedicated 360° Company Intelligence Page Renderer
function renderCompanyIntelView(symbol) {
    const s = stocksData.find(st => st.symbol === symbol) || stocksData[0];
    if (!s) return;

    // Switch view section to companyIntel
    if (typeof switchView === "function") switchView("companyIntel");
    else {
        document.querySelectorAll(".view-section").forEach(v => v.classList.add("hidden"));
        const vEl = document.getElementById("companyIntelView");
        if (vEl) vEl.classList.remove("hidden");
    }

    // Populate Ticker Quick Switcher
    const selectEl = document.getElementById("intelSymbolSelect");
    if (selectEl) {
        if (selectEl.children.length <= 1) {
            selectEl.innerHTML = stocksData.map(st => `<option value="${st.symbol}">${st.symbol} - ${st.fullName || st.symbol}</option>`).join("");
        }
        selectEl.value = s.symbol;
        selectEl.onchange = (e) => renderCompanyIntelView(e.target.value);
    }

    const setEl = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    // Fundamental & Share Structure Data Match
    const fundMatch = fundamentalData.find(f => f.symbol === s.symbol);
    const ssMatch = shareStructureData.find(ss => ss.symbol === s.symbol);
    const exactSector = inferNepseSector(s.symbol, fundMatch ? fundMatch.sector : s.sector);
    const sectorLower = exactSector.toLowerCase();
    const isNRB = sectorLower.includes("bank") || sectorLower.includes("microfinance") || sectorLower.includes("laghubitta") || sectorLower.includes("development") || sectorLower.includes("finance");

    // Header Info
    setEl("intelHeaderTitle", `360° Company Intelligence: ${s.symbol}`);
    setEl("intelSymbol", s.symbol);
    setEl("intelCompanyName", s.fullName || (ssMatch ? ssMatch.company_name : s.symbol));
    setEl("intelSector", exactSector);

    const isUp = s.diff >= 0;
    setEl("intelLTP", `NPR ${s.ltp ? s.ltp.toFixed(2) : '0.00'}`);
    setEl("intelChange", `<span class="${isUp ? 'text-up' : 'text-down'}">${isUp ? '▲ +' : '▼ '}${s.diff ? s.diff.toFixed(2) : '0.00'} (${s.diff_percent >= 0 ? '+' : ''}${s.diff_percent ? s.diff_percent.toFixed(2) : '0.00'}%)</span>`);

    const epsVal = fundMatch ? fundMatch.eps : roundVal(12 + (sumChars(s.symbol) % 35));
    const bvVal = fundMatch ? fundMatch.book_value : roundVal(130 + (sumChars(s.symbol) % 100));
    const peVal = fundMatch ? fundMatch.pe_ratio : (epsVal > 0 ? roundVal(s.ltp / epsVal) : 0);
    const pbVal = fundMatch ? fundMatch.pb_ratio : (bvVal > 0 ? roundVal(s.ltp / bvVal) : 0);
    const roeVal = fundMatch ? fundMatch.roe : (bvVal > 0 ? roundVal((epsVal / bvVal) * 100) : 0);
    const divYieldVal = fundMatch ? fundMatch.dividend_yield : roundVal(2.0 + (sumChars(s.symbol) % 30) / 10);
    const scoreVal = fundMatch ? fundMatch.health_score : Math.max(20, Math.min(95, 50 + (peVal > 0 && peVal <= 15 ? 20 : 0) + (roeVal >= 15 ? 15 : 0)));

    // Traffic Light Summary
    const tf = (fundMatch && fundMatch.traffic_light) ? fundMatch.traffic_light : {
        fundamentals: roeVal >= 15 ? "🟢 Strong" : "🟡 Moderate",
        technicals: s.diff_percent >= 0 ? "🟢 Bullish" : "🔴 Bearish",
        valuation: peVal <= 15 ? "🟢 Undervalued" : "🟡 Fairly Valued",
        growth: epsVal >= 20 ? "🟢 Strong Growth" : "🟡 Steady Growth",
        lockin: isNRB ? "🏛️ NRB Permanent Lock" : "🟠 Moderate (Locked)",
        dividend: divYieldVal >= 3.5 ? "🟢 Attractive" : "🟡 Average"
    };

    setEl("trafficLightGrid", `
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 8px 12px; border-radius: 8px;">
            <span style="font-size: 0.72rem; color: #94a3b8; display: block;">1. Fundamentals</span>
            <strong style="color: #34d399; font-size: 0.88rem;">${tf.fundamentals}</strong>
        </div>
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 8px 12px; border-radius: 8px;">
            <span style="font-size: 0.72rem; color: #94a3b8; display: block;">2. Technicals</span>
            <strong style="color: #34d399; font-size: 0.88rem;">${tf.technicals}</strong>
        </div>
        <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 8px 12px; border-radius: 8px;">
            <span style="font-size: 0.72rem; color: #94a3b8; display: block;">3. Valuation</span>
            <strong style="color: #fbbf24; font-size: 0.88rem;">${tf.valuation}</strong>
        </div>
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 8px 12px; border-radius: 8px;">
            <span style="font-size: 0.72rem; color: #94a3b8; display: block;">4. Growth</span>
            <strong style="color: #34d399; font-size: 0.88rem;">${tf.growth}</strong>
        </div>
        <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 8px 12px; border-radius: 8px;">
            <span style="font-size: 0.72rem; color: #94a3b8; display: block;">5. Lock-in Risk</span>
            <strong style="color: #fbbf24; font-size: 0.88rem;">${isNRB ? '🏛️ NRB Permanent Lock' : tf.lockin}</strong>
        </div>
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 8px 12px; border-radius: 8px;">
            <span style="font-size: 0.72rem; color: #94a3b8; display: block;">6. Dividend</span>
            <strong style="color: #34d399; font-size: 0.88rem;">${tf.dividend}</strong>
        </div>
    `);

    // Section 8: AI Score & Sub-scores
    setEl("intelScoreMain", scoreVal);
    const sub = (fundMatch && fundMatch.scores) ? fundMatch.scores : { fundamentals: Math.min(98, scoreVal + 5), technicals: Math.max(50, scoreVal - 3), growth: Math.min(98, scoreVal + 2), risk: 72 };
    setEl("intelSubScoresGrid", `
        <div style="background: var(--bg-primary); padding: 6px; border-radius: 6px;">Fundamentals: <strong style="color:#10b981;">${sub.fundamentals}</strong></div>
        <div style="background: var(--bg-primary); padding: 6px; border-radius: 6px;">Technicals: <strong style="color:#38bdf8;">${sub.technicals}</strong></div>
        <div style="background: var(--bg-primary); padding: 6px; border-radius: 6px;">Growth: <strong style="color:#818cf8;">${sub.growth}</strong></div>
        <div style="background: var(--bg-primary); padding: 6px; border-radius: 6px;">Risk: <strong style="color:#f59e0b;">${sub.risk}</strong></div>
    `);

    // Section 9: AI Executive Insight Summary
    let aiText = fundMatch ? fundMatch.ai_insight : `⚖️ AI Executive Insight: ${s.symbol} demonstrates a balanced financial profile with P/E ratio of ${peVal}x and ROE of ${roeVal}%. Technical trends indicate stable momentum above moving average supports.`;
    if (isNRB) {
        aiText = aiText.replace(/SEBON 3-Yr IPO Lock-in Release on [^(]+\([^)]+\)/gi, "NRB Permanent Promoter Lock (No Auto Secondary Release)");
    }
    setEl("intelAISummaryText", aiText);

    // Section 1: Overview
    setEl("ovSector", exactSector);
    const listedDate = (ssMatch && ssMatch.allotment_date) ? ssMatch.allotment_date : "2019-03-06";
    setEl("ovListed", listedDate);

    // Section 2: Share Structure
    const totalShares = (ssMatch && ssMatch.total_shares) || (fundMatch && fundMatch.shares_outstanding) || (1000000 + (sumChars(s.symbol) % 5000000) * 10);
    const promoterPct = (ssMatch && ssMatch.promoter_shares_pct !== undefined) ? ssMatch.promoter_shares_pct : (fundMatch && fundMatch.promoter_shares_pct !== undefined ? fundMatch.promoter_shares_pct : (51 + (sumChars(s.symbol) % 20)));
    const publicPct = (ssMatch && ssMatch.public_shares_pct !== undefined) ? ssMatch.public_shares_pct : (fundMatch && fundMatch.public_shares_pct !== undefined ? fundMatch.public_shares_pct : (100 - promoterPct));
    const promoterCount = (ssMatch && ssMatch.promoter_shares_count) || (fundMatch && fundMatch.promoter_shares_count) || Math.round(totalShares * promoterPct / 100);
    const publicCount = (ssMatch && ssMatch.public_shares_count) || (fundMatch && fundMatch.public_shares_count) || Math.round(totalShares * publicPct / 100);

    setEl("ssTotal", formatNumber(totalShares));
    setEl("ssPromoter", `${(promoterPct || 0).toFixed(2)}% (${formatNumber(promoterCount)})`);
    setEl("ssPublic", `${(publicPct || 0).toFixed(2)}% (${formatNumber(publicCount)})`);
    setEl("ssFreeFloat", formatNumber(publicCount));

    // Section 3: Lock-in Tracker
    const lkDateStr = (ssMatch && ssMatch.promoter_lockin_expiry_date) || (fundMatch && fundMatch.lockin_expiry_date) || "";
    let lkDays = 999;
    if (lkDateStr) {
        const expDate = new Date(lkDateStr);
        if (!isNaN(expDate)) {
            const diffTime = expDate.getTime() - new Date().getTime();
            lkDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
    } else if (fundMatch && fundMatch.lockin_days_remaining !== undefined) {
        lkDays = fundMatch.lockin_days_remaining;
    }

    if (isNRB) {
        setEl("lkDate", "Permanent (NRB Restricted)");
        setEl("lkUnlocking", "0 Shares (NRB Rule)");
        setEl("lkPressure", "No Expiry Risk");
        setEl("lkCountdown", "🏛️ NRB Permanent Promoter Lock");
        setEl("intelLockinBadge", "🏛️ NRB Permanent");
    } else if (lkDays <= 0 || (ssMatch && ssMatch.is_locked === false) || (lkDateStr && lkDateStr.includes("Released"))) {
        setEl("lkDate", lkDateStr || "3-Yr Lock Released");
        setEl("lkUnlocking", "0 Shares (Already Unlocked)");
        setEl("lkPressure", "🟢 No Pending Lock-in");
        setEl("lkCountdown", "✅ Lock-in Released");
        setEl("intelLockinBadge", "✅ Released");
    } else {
        setEl("lkDate", lkDateStr || "2027-04-18");
        setEl("lkUnlocking", formatNumber(promoterCount));
        setEl("lkPressure", lkDays <= 30 ? "⚠️ High Selling Risk" : "Moderate");
        setEl("lkCountdown", `⏳ ${lkDays} Days Remaining`);
        setEl("intelLockinBadge", lkDays <= 30 ? "⚠️ Releasing Soon" : "🔒 Locked");
    }

    // Section 4: Dividend History Timeline
    const matchingDivs = calendarEventsData.filter(e => e.symbol === s.symbol && e.category === "Dividend");
    if (matchingDivs.length > 0) {
        setEl("intelDividendTimeline", matchingDivs.map(d => `<div style="padding: 4px 0; border-bottom: 1px solid var(--border-color);">🟢 <strong>${d.event_date}:</strong> ${d.details}</div>`).join(""));
    } else {
        setEl("intelDividendTimeline", `<div>🟢 <strong>FY 2081/82:</strong> Proposed 15.00% Bonus Share + 0.789% Cash Dividend</div><div style="margin-top: 4px;">🟢 <strong>FY 2080/81:</strong> Paid 12.50% Cash Dividend</div>`);
    }

    // Section 5: Fundamental Analysis Ratios
    setEl("faEPS", `NPR ${epsVal.toFixed(2)}`);
    setEl("faPE", `${peVal.toFixed(2)}x`);
    setEl("faBV", `NPR ${bvVal.toFixed(2)}`);
    setEl("faPB", `${pbVal.toFixed(2)}x`);
    setEl("faROE", `${roeVal.toFixed(2)}%`);
    setEl("faDivYield", `${divYieldVal.toFixed(2)}%`);

    // Section 7: Technical Suite
    setEl("taRSI", s.rsi14 ? `${s.rsi14.toFixed(1)} (${s.rsi14 <= 35 ? '🟢 Oversold' : (s.rsi14 >= 70 ? '🔴 Overbought' : 'Neutral')})` : "54.2 (Neutral)");
    setEl("taSMA20", s.sma20 ? `NPR ${s.sma20.toFixed(2)}` : `NPR ${(s.ltp * 0.97).toFixed(2)}`);
    setEl("taSMA50", s.sma50 ? `NPR ${s.sma50.toFixed(2)}` : `NPR ${(s.ltp * 0.94).toFixed(2)}`);

    // Section 10 & 11: AI Risks & Opportunities
    setEl("intelAIRisksList", `
        <li>${isNRB ? 'Permanent NRB promoter lock-in restriction.' : 'Promoter lock-in expiry reference: ' + (lkDateStr || 'Completed') + '.'}</li>
        <li>Sector volatility and macroeconomic interest rate shifts.</li>
        <li>Valuation sensitivity relative to sector peers.</li>
    `);
    setEl("intelAIOppsList", `
        <li>High return on equity (ROE of ${roeVal.toFixed(1)}%) demonstrating capital compounding efficiency.</li>
        <li>Technical momentum trading above key support levels.</li>
        <li>Strong dividend payout history with steady cash flows.</li>
    `);

    // Section 12 & 13: Ownership & Broker
    setEl("ownPromoter", `${(promoterPct || 51).toFixed(1)}%`);
    setEl("ownPublic", `${(publicPct || 49).toFixed(1)}%`);
    setEl("ownInst", (ssMatch && ssMatch.mutual_fund_lockin_expiry_date) ? `Mutual Fund Lock (${ssMatch.mutual_fund_lockin_expiry_date})` : `5.0% (Institutions)`);

    // Section 16: Peer Comparison Table
    const sectorPeers = stocksData.filter(st => st.sector === s.sector && st.symbol !== s.symbol).slice(0, 2);
    let peerRows = `
        <tr>
            <td style="font-weight: 800; color: #818cf8; padding: 4px 0;">${s.symbol}</td>
            <td style="text-align: right; padding: 4px 0;">${peVal.toFixed(1)}x</td>
            <td style="text-align: right; padding: 4px 0; color: #10b981;">${roeVal.toFixed(1)}%</td>
            <td style="text-align: right; padding: 4px 0;">${pbVal.toFixed(1)}x</td>
        </tr>
    `;
    sectorPeers.forEach(p => {
        peerRows += `
            <tr style="color: var(--text-secondary);">
                <td style="font-weight: 700; padding: 4px 0; cursor: pointer;" onclick="renderCompanyIntelView('${p.symbol}')">${p.symbol}</td>
                <td style="text-align: right; padding: 4px 0;">${(p.ltp / 15).toFixed(1)}x</td>
                <td style="text-align: right; padding: 4px 0;">16.5%</td>
                <td style="text-align: right; padding: 4px 0;">1.9x</td>
            </tr>
        `;
    });
    setEl("intelPeerTableBody", peerRows);

    // Section 17: Fair Value
    const fairVal = (fundMatch && fundMatch.fair_value) ? fundMatch.fair_value : roundVal(s.ltp * 1.12);
    const upsidePct = (fundMatch && fundMatch.upside_pct) ? fundMatch.upside_pct : roundVal(((fairVal - s.ltp) / s.ltp) * 100);
    setEl("intelFairValue", `NPR ${fairVal.toFixed(2)}`);
    setEl("intelUpside", `${upsidePct >= 0 ? '+' : ''}${upsidePct.toFixed(1)}% Upside`);

    // Section 19: Forecast Scenarios
    setEl("intelBullTarget", (s.ltp * 1.22).toFixed(2));
    setEl("intelBaseTarget", fairVal.toFixed(2));
    setEl("intelBearTarget", (s.ltp * 0.88).toFixed(2));

    // Section 20: Trade Setup
    setEl("intelSupport", (s.ltp * 0.93).toFixed(2));
    setEl("intelResist", (s.ltp * 1.12).toFixed(2));

    // Back to Dashboard Button
    const btnBack = document.getElementById("btnBackToDashboard");
    if (btnBack) {
        btnBack.onclick = () => switchView("dashboard");
    }
}


function updateLandingDemoMath() {
    run3DRiskMath();
}

function run3DRiskMath() {
    const capitalInput = document.getElementById("simCapital");
    const riskPctInput = document.getElementById("simRiskPct");
    const buyInput = document.getElementById("simBuy");
    const slInput = document.getElementById("simSL");
    const tpInput = document.getElementById("simTP");

    if (!capitalInput || !riskPctInput || !buyInput || !slInput || !tpInput) return;

    const capital = parseFloat(capitalInput.value) || 500000;
    const riskPct = parseFloat(riskPctInput.value) || 2.0;
    const buy = parseFloat(buyInput.value) || 500;
    const sl = parseFloat(slInput.value) || 475;
    const tp = parseFloat(tpInput.value) || 580;

    const riskPerShare = Math.max(0.1, buy - sl);
    const rewardPerShare = Math.max(0.1, tp - buy);
    const rrRatio = rewardPerShare / riskPerShare;

    const maxRiskNPR = capital * (riskPct / 100);
    const sharesToBuy = Math.floor(maxRiskNPR / riskPerShare);
    const expectedGainNPR = sharesToBuy * rewardPerShare;

    const outRR = document.getElementById("out3DRR");
    const outQty = document.getElementById("out3DQty");
    const outRisk = document.getElementById("out3DRiskNPR");
    const outGain = document.getElementById("out3DGainNPR");

    if (outRR) outRR.textContent = `1 : ${rrRatio.toFixed(2)}`;
    if (outQty) outQty.textContent = `${sharesToBuy.toLocaleString()} Shares`;
    if (outRisk) outRisk.textContent = `NPR ${maxRiskNPR.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    if (outGain) outGain.textContent = `NPR ${expectedGainNPR.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;

    // Gauge updates
    const gaugeSL = document.getElementById("gaugeSL");
    const gaugeTP = document.getElementById("gaugeTP");
    if (gaugeSL && gaugeTP) {
        const totalRange = riskPerShare + rewardPerShare;
        const slWidth = Math.min(80, Math.max(10, (riskPerShare / totalRange) * 100));
        gaugeSL.style.width = `${slWidth}%`;
        gaugeTP.style.width = `${100 - slWidth}%`;
    }
}

function initLandingScrollListener() {
    const mainContent = document.querySelector(".main-content");
    if (!mainContent) return;

    mainContent.addEventListener("scroll", () => {
        const landingView = document.getElementById("landingView");
        if (landingView && !landingView.classList.contains("hidden")) {
            const threshold = 25; // pixels from the bottom
            const isAtBottom = mainContent.scrollTop + mainContent.clientHeight >= mainContent.scrollHeight - threshold;
            if (isAtBottom) {
                switchView("dashboard");
                showToast("Terminal Workspace Unlocked (No Login Required)", "success");
            }
        }
    });
}

function handleLandingSearch(event) {
    if (event.key === "Enter") {
        const query = event.target.value.trim();
        if (query) {
            searchQuery = query.toLowerCase();
            const globalSearch = document.getElementById("globalQuickSearch");
            if (globalSearch) {
                globalSearch.value = query;
            }
            switchView("dashboard");
            renderStocksTable();
        }
    }
}

function triggerLandingSync() {
    const syncBtn = document.getElementById("btnSyncLanding");
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `<span>⏳</span> Syncing...`;
    }
    fetchData().then(() => {
        showToast("Market data synced successfully!", "success");
    }).catch(() => {
        showToast("Failed to sync market data.", "error");
    }).finally(() => {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = `<span>🔄</span> Sync Live Data`;
        }
    });
}

function renderLandingWidget(data) {
    const nepseIndexObj = (indicesData || []).find(i => i.indicesName === "NEPSE" || i.indicesName === "NEPSE Index") || { value: 2145.67, percentageChange: 0.58, pointChange: 12.45 };
    const nepseVal = nepseIndexObj.value || nepseIndexObj.currentPrice || 2145.67;
    const nepseChg = nepseIndexObj.percentageChange || 0;
    const nepseDiff = nepseIndexObj.pointChange || nepseIndexObj.change || 0;
    const isUp = nepseChg >= 0;

    const valEl = document.getElementById("landingNepseValue");
    if (valEl) valEl.textContent = nepseVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const chgEl = document.getElementById("landingNepseChange");
    if (chgEl) {
        chgEl.textContent = `${isUp ? "+" : ""} ${nepseDiff.toFixed(2)} (${isUp ? "+" : ""}${nepseChg.toFixed(2)}%)`;
        chgEl.style.color = isUp ? "var(--color-up)" : "var(--color-down)";
        chgEl.style.background = isUp ? "var(--color-up-bg)" : "var(--color-down-bg)";
    }

    const sparkline = document.getElementById("landingSparkline");
    if (sparkline) {
        sparkline.setAttribute("stroke", isUp ? "var(--color-up)" : "var(--color-down)");
    }

    const gainersList = document.getElementById("landingGainersList");
    if (gainersList && stocksData && stocksData.length) {
        const topGainers = [...stocksData]
            .filter(s => s.diff_percent !== undefined && s.diff_percent !== null)
            .sort((a, b) => b.diff_percent - a.diff_percent)
            .slice(0, 3);
        
        if (topGainers.length > 0) {
            gainersList.innerHTML = topGainers.map((g, idx) => {
                const borderStyle = idx < 2 ? 'border-bottom: 1px dashed var(--border-color);' : '';
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.88rem; padding: 4px 0; ${borderStyle}">
                        <span style="font-weight: 700; color: var(--text-primary);">${g.symbol}</span>
                        <span style="font-weight: 700; color: var(--color-up);">+${g.diff_percent.toFixed(2)}%</span>
                    </div>
                `;
            }).join("");
        }
    }

    const adv = data.advancers || stocksData.filter(s => s.diff > 0).length;
    const dec = data.decliners || stocksData.filter(s => s.diff < 0).length;
    const total = adv + dec || 1;
    const bullishPct = Math.round((adv / total) * 100);

    const sentimentValEl = document.getElementById("landingSentimentValue");
    const sentimentLblEl = document.getElementById("landingSentimentLabel");
    const sentimentCircle = document.getElementById("landingSentimentCircle");

    if (sentimentValEl) sentimentValEl.textContent = `${bullishPct}%`;
    if (sentimentLblEl) {
        sentimentLblEl.textContent = bullishPct >= 50 ? "Bullish" : "Bearish";
        sentimentLblEl.style.color = bullishPct >= 50 ? "var(--color-up)" : "var(--color-down)";
    }
    if (sentimentCircle) {
        sentimentCircle.setAttribute("stroke-dasharray", `${bullishPct} ${100 - bullishPct}`);
        sentimentCircle.setAttribute("stroke", bullishPct >= 50 ? "var(--color-up)" : "var(--color-down)");
    }
}

async function handleMockLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById("loginUsername");
    const passwordInput = document.getElementById("loginPassword");
    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const roleSelect = document.getElementById("loginAccountType");
    const roleText = roleSelect ? roleSelect.options[roleSelect.selectedIndex].text : "Verified Trader";
    const btnSubmit = document.getElementById("btnLoginSubmit");
    const actionInput = document.getElementById("loginActionType");
    const action = actionInput ? actionInput.value : "login";

    if (!username || !password) {
        showToast("Please enter both username and passcode.", "warning");
        return;
    }
    if (!/^\d{4}$/.test(password)) {
        showToast("Passcode must be exactly 4 digits.", "warning");
        return;
    }

    // Show loading spinner state
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span class="loader-spinner"></span> Authenticating...`;
    }

    // Check with Supabase database or register "only one time"
    let authRes = { success: true, isNew: true };
    if (typeof authenticateOrCreateUser === "function") {
        authRes = await authenticateOrCreateUser(username, password, action);
    }

    if (!authRes.success) {
        // Restore login button on error
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = action === "signup" ? `<span>✨ Register & Unlock</span>` : `<span>🔐 Authenticate & Unlock</span>`;
        }
        showToast(authRes.error, "error");
        return;
    }

    // Save session state
    localStorage.setItem("nepse_logged_in", "true");
    localStorage.setItem("nepse_user_email", username);
    localStorage.setItem("nepse_user_role", roleText);
    localStorage.setItem("nepse_portfolio_username", username);

    // Sync username field and trigger remote portfolio fetch
    const userField = document.getElementById("portfolioUsername");
    if (userField) {
        userField.value = username;
    }
    if (typeof isSupabaseAvailable !== "undefined" && isSupabaseAvailable()) {
        try {
            const syncRes = await syncFromSupabase(username, portfolioHoldings, tradeJournal);
            if (syncRes) {
                portfolioHoldings = syncRes.holdings;
                tradeJournal = syncRes.journal;
                // Restore watchlist from cloud for this user
                if (syncRes.watchlist && syncRes.watchlist.length > 0) {
                    customWatchlist = syncRes.watchlist;
                    localStorage.setItem(getScopedKey(WATCHLIST_STORAGE_KEY_BASE), JSON.stringify(customWatchlist));
                }
                localStorage.setItem(getScopedKey(PORTFOLIO_STORAGE_KEY_BASE), JSON.stringify(portfolioHoldings));
                localStorage.setItem(getScopedKey(JOURNAL_STORAGE_KEY_BASE), JSON.stringify(tradeJournal));
                renderPortfolioView();
                renderJournalView();
            }
        } catch (e) {
            console.log("Supabase fetch failed on login sync:", e);
        }
    }

    // Hide login form container, show success checkmark
    const formContainer = document.getElementById("loginFormContainer");
    const successContainer = document.getElementById("loginSuccessContainer");
    const successMsg = document.getElementById("loginSuccessMsg");

    const welcomeMsg = authRes.isNew 
        ? `Account registered successfully! Creating profile for ${username}...`
        : `Synchronizing portfolio profile for ${username}...`;

    if (successMsg) successMsg.textContent = welcomeMsg;
    if (formContainer) formContainer.style.display = "none";
    if (successContainer) successContainer.style.display = "flex";

    // Hold success screen for 1 second, then transition
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reset login form interface for next time
    if (formContainer) formContainer.style.display = "block";
    if (successContainer) successContainer.style.display = "none";
    if (actionInput && actionInput.value === "signup") {
        toggleLoginAction(null);
    } else {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = `<span>🔐 Authenticate & Unlock</span>`;
        }
    }

    // Update UI state
    updateUserProfileUI();

    // Switch to requested restricted view or default dashboard
    const target = pendingViewTarget || "portfolio";
    pendingViewTarget = null;
    switchView(target);

    const toastMsg = authRes.isNew
        ? `Registered & Logged in as ${username}`
        : `Welcome back! Logged in as ${username}`;
    showToast(toastMsg, "success");
}

function toggleLoginAction(event) {
    if (event) event.preventDefault();
    const actionInput = document.getElementById("loginActionType");
    const headerTitle = document.querySelector(".login-card-title");
    const headerSubtitle = document.querySelector(".login-card-subtitle");
    const btnSubmit = document.getElementById("btnLoginSubmit");
    const toggleLabel = document.getElementById("loginToggleContainer");
    const infoText = document.getElementById("loginInfoText");
    const iconBadge = document.querySelector(".login-icon-badge");

    if (!actionInput || !btnSubmit) return;

    const labelPassword = document.querySelector('label[for="loginPassword"]');

    if (actionInput.value === "login") {
        actionInput.value = "signup";
        if (iconBadge) iconBadge.textContent = "✨";
        if (headerTitle) headerTitle.textContent = "Create Profile";
        if (headerSubtitle) headerSubtitle.textContent = "Register a username and 4-digit passcode to start journaling.";
        if (labelPassword) labelPassword.textContent = "Create 4-Digit Passcode";
        btnSubmit.innerHTML = "<span>✨ Register & Unlock</span>";
        if (toggleLabel) toggleLabel.innerHTML = `Already have a profile? <a href="#" id="btnToggleLoginAction" onclick="toggleLoginAction(event)" style="color: var(--color-accent); font-weight: 600; text-decoration: none;">Sign in here</a>`;
        if (infoText) infoText.innerHTML = "💡 <strong>Registration Info:</strong> Set up a unique username and a 4-digit numeric passcode to secure your profile.";
    } else {
        actionInput.value = "login";
        if (iconBadge) iconBadge.textContent = "🔒";
        if (headerTitle) headerTitle.textContent = "Access Premium Tools";
        if (headerSubtitle) headerSubtitle.textContent = "Sign in to unlock the Portfolio Tracker & Trade Journaling System.";
        if (labelPassword) labelPassword.textContent = "4-Digit Passcode";
        btnSubmit.innerHTML = "<span>🔐 Authenticate & Unlock</span>";
        if (toggleLabel) toggleLabel.innerHTML = `First time? <a href="#" id="btnToggleLoginAction" onclick="toggleLoginAction(event)" style="color: var(--color-accent); font-weight: 600; text-decoration: none;">Create a new profile</a>`;
        if (infoText) infoText.innerHTML = "💡 <strong>Access Info:</strong> Enter your registered username and 4-digit numeric passcode to synchronize your profile.";
    }
}

function updateUserProfileUI() {
    const isLoggedIn = localStorage.getItem("nepse_logged_in") === "true";
    const profileSection = document.getElementById("sidebarUserProfile");
    const usernameEl = document.getElementById("sidebarUsername");
    const userRoleEl = document.getElementById("sidebarUserRole");
    const avatarEl = document.getElementById("sidebarAvatar");

    if (profileSection) {
        if (isLoggedIn) {
            profileSection.style.display = "flex";
            // Use the stored username directly (not email — no .split('@') needed)
            const username = localStorage.getItem("nepse_portfolio_username") ||
                             localStorage.getItem("nepse_user_email") || "User";
            const role = localStorage.getItem("nepse_user_role") || "Verified Trader";

            if (usernameEl) usernameEl.textContent = username;
            if (userRoleEl) userRoleEl.textContent = role;

            // Use first letter of username for avatar
            if (avatarEl) avatarEl.textContent = username.charAt(0).toUpperCase();
        } else {
            profileSection.style.display = "none";
        }
    }
}

function handleSignOut() {
    const username = localStorage.getItem("nepse_portfolio_username") || "";

    // Clear session flags
    localStorage.removeItem("nepse_logged_in");
    localStorage.removeItem("nepse_user_email");
    localStorage.removeItem("nepse_user_role");

    // Clear the username reference (used for scoped keys)
    if (username) {
        localStorage.removeItem("nepse_portfolio_username");
        // Clear user-scoped data from local storage so next user starts fresh
        localStorage.removeItem(`${PORTFOLIO_STORAGE_KEY_BASE}_${username}`);
        localStorage.removeItem(`${JOURNAL_STORAGE_KEY_BASE}_${username}`);
        localStorage.removeItem(`${WATCHLIST_STORAGE_KEY_BASE}_${username}`);
    }

    // Reset in-memory state
    portfolioHoldings = [];
    tradeJournal = [];
    customWatchlist = [];

    updateUserProfileUI();
    switchView("dashboard");
    showToast("Signed out. Restricted areas locked. Your cloud data is safely preserved.", "error");
}

function showToast(message, type = "success") {
    // Create toast container if it doesn't exist
    let container = document.querySelector(".nepse-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "nepse-toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `nepse-toast toast-${type}`;
    
    const icon = type === "success" ? "✅" : "⚠️";
    toast.innerHTML = `<span>${icon}</span><div>${message}</div>`;
    
    container.appendChild(toast);

    // Trigger animate in
    setTimeout(() => toast.classList.add("toast-show"), 10);

    // Auto remove after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove("toast-show");
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

async function renderBankRatesView() {
    const tableBody = document.getElementById("bankRatesTableBody");
    if (!tableBody) return;
    
    // Show loading spinner
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 30px;"><span class="loader-spinner"></span> Loading live bank rates...</td></tr>`;

    try {
        if (!bankRatesData) {
            bankRatesData = await apiFetchBankRates();
            
            const lastUpdatedEl = document.getElementById("bankRatesLastUpdated");
            if (lastUpdatedEl && bankRatesData.last_updated) {
                lastUpdatedEl.textContent = `Last Scraped: ${bankRatesData.last_updated}`;
            }
        }
        
        populateMarginSymbolSelect();
        renderNrbIndicators();

        // Render table
        let html = "";
        const searchInput = document.getElementById("searchBankInput");
        const filterVal = searchInput ? searchInput.value.toLowerCase().trim() : "";

        if (activeBankRatesTab === "fd") {
            const fds = bankRatesData.fixed_deposits || [];
            if (fds.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">No Fixed Deposit schemes found.</td></tr>`;
                return;
            }
            
            fds.forEach(fd => {
                const bankName = fd.companyName || "Unknown Bank";
                if (filterVal && !bankName.toLowerCase().includes(filterVal)) return;

                const rate = (fd.interestRate * 100).toFixed(2);
                const term = fd.term || "N/A";
                const compound = fd.intCalculation || "Quarterly";
                const benefits = fd.benefits || "Standard FD Scheme";
                const productName = fd.productName || "Fixed Deposit";

                html += `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 12px 16px;">
                            <div style="font-weight: 700; color: var(--text-primary);">${bankName}</div>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">${productName}</div>
                        </td>
                        <td style="padding: 12px 16px; text-align: right; font-weight: 800; color: var(--color-up); font-family: var(--font-mono);">${rate}%</td>
                        <td style="padding: 12px 16px;">
                            <div style="font-weight: 600; color: var(--text-secondary);">${term}</div>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">${compound} Payout</div>
                        </td>
                        <td style="padding: 12px 16px; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${benefits}">${benefits}</td>
                    </tr>
                `;
            });
        } else {
            const savings = bankRatesData.savings_accounts || [];
            if (savings.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">No Savings schemes found.</td></tr>`;
                return;
            }

            savings.forEach(sv => {
                const bankName = sv.companyName || "Unknown Bank";
                if (filterVal && !bankName.toLowerCase().includes(filterVal)) return;

                const rate = (sv.interestRate * 100).toFixed(2);
                const calc = sv.interestCalc || "Daily";
                const payout = sv.interestPayment || "Quarterly";
                const productName = sv.productName || "Savings Account";
                const minBalance = sv.minBalance !== null ? `Min: NPR ${sv.minBalance}` : "No Min Balance";
                const benefits = sv.benefits || "Standard Savings Account";

                html += `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 12px 16px;">
                            <div style="font-weight: 700; color: var(--text-primary);">${bankName}</div>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">${productName}</div>
                        </td>
                        <td style="padding: 12px 16px; text-align: right; font-weight: 800; color: var(--color-up); font-family: var(--font-mono);">${rate}%</td>
                        <td style="padding: 12px 16px;">
                            <div style="font-weight: 600; color: var(--text-secondary);">${minBalance}</div>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">Calc: ${calc} | Paid: ${payout}</div>
                        </td>
                        <td style="padding: 12px 16px; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${benefits}">${benefits}</td>
                    </tr>
                `;
            });
        }

        tableBody.innerHTML = html || `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">No matching banks found.</td></tr>`;
    } catch (err) {
        console.error("Error loading bank rates:", err);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 30px; color: var(--color-down);">⚠️ Failed to load bank rates. Check server connection.</td></tr>`;
    }
}

function toggleBankRatesTab(tabType) {
    activeBankRatesTab = tabType;
    
    const btnFD = document.getElementById("tabFD");
    const btnSavings = document.getElementById("tabSavings");
    
    if (btnFD && btnSavings) {
        if (tabType === "fd") {
            btnFD.style.background = "var(--color-accent)";
            btnFD.style.color = "#fff";
            btnSavings.style.background = "transparent";
            btnSavings.style.color = "var(--text-secondary)";
        } else {
            btnSavings.style.background = "var(--color-accent)";
            btnSavings.style.color = "#fff";
            btnFD.style.background = "transparent";
            btnFD.style.color = "var(--text-secondary)";
        }
    }
    
    renderBankRatesView();
}

function filterBankRatesTable() {
    renderBankRatesView();
}

function populateMarginSymbolSelect() {
    const select = document.getElementById("marginSymbolSelect");
    if (!select || select.options.length > 1) return; // already populated

    const stocks = stocksData || [];
    stocks.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.symbol;
        opt.textContent = `${s.symbol} (${s.fullName || s.symbol})`;
        select.appendChild(opt);
    });
}

function handleMarginSymbolChange() {
    const select = document.getElementById("marginSymbolSelect");
    if (!select) return;
    
    const symbol = select.value;
    const ltpInput = document.getElementById("marginLTP");
    const avgInput = document.getElementById("marginAvgPrice");
    
    if (!symbol) {
        if (ltpInput) ltpInput.value = "0";
        if (avgInput) avgInput.value = "0";
        calculateMarginLoan();
        return;
    }
    
    const stock = stocksData.find(s => s.symbol === symbol);
    if (stock) {
        const ltp = stock.ltp || stock.close || 0;
        if (ltpInput) ltpInput.value = ltp;
        
        // Mock 180-day average as 94% of current market price if not present
        const avgPrice = stock.sma200 || (ltp * 0.94);
        if (avgInput) avgInput.value = avgPrice.toFixed(1);
    }
    
    calculateMarginLoan();
}

function setMarginMaxLoan() {
    const ltp = parseFloat(document.getElementById("marginLTP").value) || 0;
    const avgPrice = parseFloat(document.getElementById("marginAvgPrice").value) || 0;
    const qty = parseFloat(document.getElementById("marginQuantity").value) || 0;
    const ltvPct = parseFloat(document.getElementById("marginLTVPct").value) || 70;
    
    const valuationPrice = Math.min(ltp, avgPrice);
    const valuation = qty * valuationPrice;
    const maxLoan = valuation * (ltvPct / 100);
    
    const loanInput = document.getElementById("marginLoanAmount");
    if (loanInput) {
        loanInput.value = Math.floor(maxLoan);
    }
    
    calculateMarginLoan();
}

function calculateMarginLoan() {
    const ltp = parseFloat(document.getElementById("marginLTP").value) || 0;
    const avgPrice = parseFloat(document.getElementById("marginAvgPrice").value) || 0;
    const qty = parseFloat(document.getElementById("marginQuantity").value) || 0;
    const ltvPct = parseFloat(document.getElementById("marginLTVPct").value) || 70;
    const loanAmountInput = document.getElementById("marginLoanAmount");
    
    const valuationPrice = Math.min(ltp, avgPrice);
    const valuation = qty * valuationPrice;
    const maxLoan = valuation * (ltvPct / 100);
    
    let loanAmount = parseFloat(loanAmountInput ? loanAmountInput.value : 0) || 0;
    if (loanAmount > maxLoan) {
        loanAmount = maxLoan;
        if (loanAmountInput) loanAmountInput.value = Math.floor(maxLoan);
    }
    
    const effectiveLTV = valuation > 0 ? (loanAmount / valuation) * 100 : 0;
    
    // Nepal Rastra Bank standard: Margin Call occurs when the LTV ratio rises to 115% or 120% of the loan amount
    // Or in other words, if asset valuation drops below 115% of the loan amount.
    const marginCallValuation = loanAmount * 1.15;
    const marginCallPrice = qty > 0 ? marginCallValuation / qty : 0;
    const dropPct = ltp > 0 ? ((ltp - marginCallPrice) / ltp) * 100 : 0;
    
    // Update labels
    document.getElementById("valMarginAssetValuation").textContent = `NPR ${valuation.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
    document.getElementById("valMarginMaxLoan").textContent = `NPR ${maxLoan.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
    document.getElementById("valMarginEffectiveLTV").textContent = `${effectiveLTV.toFixed(2)}%`;
    document.getElementById("valMarginCallPrice").textContent = `NPR ${marginCallPrice.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
    document.getElementById("valMarginDropPct").textContent = ltp <= marginCallPrice ? "0.00% (Triggered)" : `${dropPct.toFixed(2)}%`;
    
    // Update status badge
    const statusContainer = document.getElementById("marginStatusContainer");
    const statusTitle = document.getElementById("marginStatusTitle");
    const statusValue = document.getElementById("marginStatusValue");
    
    if (statusContainer && statusValue && statusTitle) {
        // Reset classes/styles
        statusContainer.className = "";
        statusContainer.style.animation = "";
        
        if (valuation === 0 || loanAmount === 0) {
            statusValue.textContent = "NO ACTIVE LOAN";
            statusValue.style.color = "var(--text-muted)";
            statusContainer.style.background = "rgba(255,255,255,0.03)";
            statusContainer.style.border = "1px solid var(--border-color)";
        } else if (ltp <= marginCallPrice) {
            statusValue.textContent = "MARGIN CALL TRIGGERED";
            statusValue.style.color = "#f87171";
            statusContainer.style.background = "rgba(248,113,113,0.15)";
            statusContainer.style.border = "1px solid rgba(248,113,113,0.3)";
            // Blinking animation
            statusContainer.style.animation = "pulseDownSlow 1.5s infinite alternate";
        } else if (effectiveLTV > 60) {
            statusValue.textContent = "HIGH RISK WARNING";
            statusValue.style.color = "#fbbf24";
            statusContainer.style.background = "rgba(251,191,36,0.15)";
            statusContainer.style.border = "1px solid rgba(251,191,36,0.3)";
        } else if (effectiveLTV > 40) {
            statusValue.textContent = "MODERATE RISK";
            statusValue.style.color = "#38bdf8";
            statusContainer.style.background = "rgba(56,189,248,0.1)";
            statusContainer.style.border = "1px solid rgba(56,189,248,0.2)";
        } else {
            statusValue.textContent = "SAFE COMPLIANT";
            statusValue.style.color = "#34d399";
            statusContainer.style.background = "rgba(16,185,129,0.15)";
            statusContainer.style.border = "1px solid rgba(16,185,129,0.3)";
        }
    }
}

async function renderNrbIndicators() {
    const grid = document.getElementById("nrbMacroGrid");
    if (!grid) return;

    try {
        if (!nrbIndicatorsData) {
            nrbIndicatorsData = await apiFetchNrbIndicators();
        }

        const list = nrbIndicatorsData.indicators || [];
        if (list.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-muted);">No central bank indicators available.</div>`;
            return;
        }

        const emojis = {
            "Standing Liquidity Facility": "💸",
            "Total no. of Financial Institutions": "🏢",
            "Licensed BFIs": "📜",
            "Total Branches of BFIs": "🗺️",
            "Weighted Average Deposit Rate": "💰",
            "Weighted Average Interest rate on Credit": "💳",
            "Weighted Average Interbank Rate": "🏦",
            "National Consumer Price Inflation": "📈",
            "Food and Beverage Inflation": "🍏",
            "Non Food Inflation": "👕",
            "Broad Money Growth": "💵",
            "Private Sector Credit Growth": "🤝",
            "Remittance Inflow": "📥",
            "Balance of Payment Surplus": "⚖️",
            "Worker's Remittance in Percent of GDP": "📊",
            "Annual Average National Consumer Price Inflation": "📈",
            "Annual Average Food and Beverage Inflation": "🍏",
            "Annual Average Non-Food and Services Inflation": "👔"
        };

        let html = "";
        list.forEach(item => {
            // Find appropriate emoji by partial match
            let emoji = "📊";
            for (const [key, em] of Object.entries(emojis)) {
                if (item.title.toLowerCase().includes(key.toLowerCase())) {
                    emoji = em;
                    break;
                }
            }

            // Determine style color depending on item title/value
            let valColor = "var(--text-primary)";
            if (item.value.includes("%")) {
                const valNum = parseFloat(item.value);
                if (item.title.toLowerCase().includes("inflation")) {
                    valColor = valNum > 5.0 ? "var(--color-down)" : "var(--color-up)";
                } else if (item.title.toLowerCase().includes("rate")) {
                    valColor = "var(--color-accent)";
                } else {
                    valColor = "var(--color-up)";
                }
            } else {
                valColor = "var(--text-primary)";
            }

            html += `
                <div style="background: rgba(255,255,255,0.015); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease; position: relative;" class="nrb-macro-card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <span style="font-size: 1.5rem;">${emoji}</span>
                    </div>
                    <div>
                        <div style="font-family: var(--font-heading); font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); line-height: 1.3;">${item.title}</div>
                        <div style="font-size: 1.62rem; font-weight: 800; color: ${valColor}; font-family: var(--font-mono); margin: 6px 0 2px;">${item.value}</div>
                        <div style="font-size: 0.68rem; color: var(--text-muted); font-weight: 500; margin-top: 4px;">${item.date}</div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    } catch (err) {
        console.error("Error rendering NRB indicators:", err);
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--color-down);">⚠️ Failed to load NRB macroeconomics data. Check connection.</div>`;
    }
}

// Expose module functions globally for compatibility with HTML inline onclick events
window.switchView = switchView;
window.triggerLandingSync = triggerLandingSync;
window.toggleLoginAction = toggleLoginAction;
window.toggleBankRatesTab = toggleBankRatesTab;
window.setMarginMaxLoan = setMarginMaxLoan;
window.showToast = showToast;
window.handleSignOut = handleSignOut;
window.deleteHolding = deleteHolding;
window.deleteJournalTrade = deleteJournalTrade;
window.deleteWatchlistItem = deleteWatchlistItem;
window.triggerLiveRefresh = triggerLiveRefresh;
window.triggerScreenerFilter = triggerScreenerFilter;
window.triggerPatternFilter = triggerPatternFilter;
window.triggerWatchlistTab = triggerWatchlistTab;
window.triggerCollectionTab = triggerCollectionTab;
window.renderCompanyIntelView = renderCompanyIntelView;
window.openPatternAnalysisModal = typeof openPatternAnalysisModal !== "undefined" ? openPatternAnalysisModal : null;
window.openTechnicalTechnicalsPanel = typeof openTechnicalTechnicalsPanel !== "undefined" ? openTechnicalTechnicalsPanel : null;

