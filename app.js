/**
 * Application Entry Point (app.js)
 * Bootstraps views, navigation, Supabase client initialization & live price auto-refresh
 */

import { state } from './src/state.js';
import { CONFIG } from './src/config.js';
import { fetchData as apiFetchData, fetchLiveTick as apiFetchLiveTick } from './src/api.js';
import { getCurrentUser, setCurrentUser, logoutUser, updateUserPillUI, loadUserLocalData, saveUserWatchlist } from './src/auth.js';
import { enrichTechnicalIndicators } from './src/utils.js';

import { renderDashboardView } from './src/views/dashboard.js';
import { renderStocksView } from './src/views/stocks.js';
import { openStockDetailModal } from './src/views/stock_detail.js';
import { renderPortfolioView } from './src/views/portfolio.js';
import { renderWatchlistView } from './src/views/watchlist.js';
import { renderAnalyticsView } from './src/views/analytics.js';

// Expose global helper methods for inline event handlers
window.openStockDetailModal = openStockDetailModal;
window.toggleWatchlistSymbol = (symbol) => {
    const list = state.customWatchlist || [];
    const idx = list.indexOf(symbol);
    if (idx >= 0) {
        list.splice(idx, 1);
    } else {
        list.push(symbol);
    }
    saveUserWatchlist(list);
};

let activeView = "dashboard";
let liveRefreshTimer = null;

async function initApp() {
    console.log(`[App] Initializing ${CONFIG.APP_NAME} v${CONFIG.VERSION}...`);

    // 1. Initialize user state & load local preferences
    const currentUser = getCurrentUser();
    updateUserPillUI(currentUser);
    loadUserLocalData();

    // 2. Setup navigation listeners
    initNavigation();
    initAuthModal();

    // 3. Initial data fetch
    try {
        await apiFetchData();
        enrichTechnicalIndicators(state.stocksData);
        renderActiveView();
    } catch(e) {
        console.error("[App] Initial data fetch error:", e);
    }

    // 4. Start 30-second live price auto-refresh
    startLiveRefreshTimer();
}

function initNavigation() {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item[data-view]");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetView = item.getAttribute("data-view");
            if (targetView) {
                switchView(targetView);
            }
        });
    });
}

function switchView(viewName) {
    activeView = viewName;
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(el => {
        el.classList.toggle("active", el.getAttribute("data-view") === viewName);
    });

    document.querySelectorAll(".view-section").forEach(sec => {
        sec.classList.toggle("active", sec.id === `view-${viewName}`);
    });

    renderActiveView();
}

function renderActiveView() {
    switch (activeView) {
        case "dashboard":
            renderDashboardView();
            break;
        case "stocks":
            renderStocksView();
            break;
        case "portfolio":
            renderPortfolioView();
            break;
        case "watchlist":
            renderWatchlistView();
            break;
        case "analytics":
            renderAnalyticsView();
            break;
        default:
            renderDashboardView();
    }
}

function startLiveRefreshTimer() {
    if (liveRefreshTimer) clearInterval(liveRefreshTimer);
    liveRefreshTimer = setInterval(async () => {
        try {
            const tick = await apiFetchLiveTick();
            if (tick && tick.stocks && tick.stocks.length) {
                const tickMap = {};
                tick.stocks.forEach(s => { tickMap[s.symbol] = s; });
                state.stocksData = state.stocksData.map(s => {
                    const live = tickMap[s.symbol];
                    return live ? { ...s, ...live } : s;
                });
                enrichTechnicalIndicators(state.stocksData);
                renderActiveView();
            }
        } catch(e) {
            console.warn("[App] Live tick refresh notice:", e.message);
        }
    }, CONFIG.LIVE_REFRESH_INTERVAL_MS);
}

function initAuthModal() {
    const authBtn = document.getElementById("navAuthBtn");
    const authModal = document.getElementById("modal-auth");
    const closeBtn = document.getElementById("closeAuthModalBtn");
    const authForm = document.getElementById("authForm");

    if (authBtn && authModal) {
        authBtn.addEventListener("click", () => {
            const user = getCurrentUser();
            if (user !== "Guest") {
                if (confirm(`Currently signed in as @${user}. Do you want to sign out?`)) {
                    logoutUser();
                }
            } else {
                authModal.classList.add("show");
            }
        });
    }

    if (closeBtn && authModal) {
        closeBtn.addEventListener("click", () => {
            authModal.classList.remove("show");
        });
    }

    if (authForm) {
        authForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const username = document.getElementById("authUsernameInput").value;
            if (username && username.trim()) {
                setCurrentUser(username);
                loadUserLocalData();
                authModal.classList.remove("show");
                renderActiveView();
            }
        });
    }
}

// Bootstrap on DOMReady
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
