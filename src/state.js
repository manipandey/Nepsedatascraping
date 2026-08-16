/**
 * Global Application State
 */
export const state = {
    stocksData: [],
    indicesData: [],
    systemxData: {},
    masterTickers: [],
    shareStructureData: [],
    corporateData: [],
    calendarEventsData: [],
    liveRefreshTimer: null,
    currentFilter: "all",
    selectedSector: "all",
    searchQuery: "",
    sortColumn: "symbol",
    sortDirection: "asc",
    currentPage: 1,
    rowsPerPage: 25,
    pendingViewTarget: null,
    bankRatesData: null,
    activeBankRatesTab: "fd",
    nrbIndicatorsData: null,
    portfolioHoldings: [],
    tradeJournal: [],
    customWatchlist: [],
    priceAlerts: [],
    
    // Scoped local storage keys
    PORTFOLIO_STORAGE_KEY_BASE: "nepse_portfolio_v3",
    JOURNAL_STORAGE_KEY_BASE: "nepse_journal_v3",
    WATCHLIST_STORAGE_KEY_BASE: "nepse_watchlist_v3",
    ALERTS_STORAGE_KEY_BASE: "nepse_alerts_v3"
};

/** Returns the username-scoped storage key for portfolio/journal/watchlist/alerts. */
export function getScopedKey(baseKey) {
    const user = localStorage.getItem("nepse_portfolio_username") || "guest";
    return `${baseKey}_${user}`;
}
