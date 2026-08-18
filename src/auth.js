/**
 * User Authentication & Supabase Session Cloud Sync
 */

import { state, getScopedKey } from './state.js';

export function getCurrentUser() {
    return localStorage.getItem("nepse_portfolio_username") || "Guest";
}

export function setCurrentUser(username) {
    if (!username || username.trim() === "") username = "Guest";
    const cleanUser = username.trim();
    localStorage.setItem("nepse_portfolio_username", cleanUser);
    updateUserPillUI(cleanUser);
    return cleanUser;
}

export function logoutUser() {
    localStorage.removeItem("nepse_portfolio_username");
    updateUserPillUI("Guest");
    window.location.reload();
}

export function updateUserPillUI(username) {
    const userLabel = document.getElementById("navUserLabel");
    if (userLabel) {
        userLabel.textContent = username === "Guest" ? "Guest User" : `@${username}`;
    }
    const authBtn = document.getElementById("navAuthBtn");
    if (authBtn) {
        authBtn.textContent = username === "Guest" ? "Sign In" : "Sign Out";
        authBtn.className = username === "Guest" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm";
    }
}

export function loadUserLocalData() {
    const user = getCurrentUser();
    
    // Load portfolio
    const portKey = getScopedKey(state.PORTFOLIO_STORAGE_KEY_BASE);
    try {
        const savedPort = localStorage.getItem(portKey);
        state.portfolioHoldings = savedPort ? JSON.parse(savedPort) : [];
    } catch(e) {
        state.portfolioHoldings = [];
    }

    // Load trade journal
    const journalKey = getScopedKey(state.JOURNAL_STORAGE_KEY_BASE);
    try {
        const savedJournal = localStorage.getItem(journalKey);
        state.tradeJournal = savedJournal ? JSON.parse(savedJournal) : [];
    } catch(e) {
        state.tradeJournal = [];
    }

    // Load watchlist
    const watchlistKey = getScopedKey(state.WATCHLIST_STORAGE_KEY_BASE);
    try {
        const savedWatch = localStorage.getItem(watchlistKey);
        state.customWatchlist = savedWatch ? JSON.parse(savedWatch) : [];
    } catch(e) {
        state.customWatchlist = [];
    }
}

export function saveUserWatchlist(watchlist) {
    state.customWatchlist = watchlist;
    const watchlistKey = getScopedKey(state.WATCHLIST_STORAGE_KEY_BASE);
    localStorage.setItem(watchlistKey, JSON.stringify(watchlist));
    
    // Sync to Supabase if window.syncWatchlistToSupabase is available
    const user = getCurrentUser();
    if (user !== "Guest" && typeof window.syncWatchlistToSupabase === "function") {
        window.syncWatchlistToSupabase(user, watchlist);
    }
}

export function saveUserPortfolio(holdings) {
    state.portfolioHoldings = holdings;
    const portKey = getScopedKey(state.PORTFOLIO_STORAGE_KEY_BASE);
    localStorage.setItem(portKey, JSON.stringify(holdings));
    
    // Sync to Supabase if window.syncPortfolioToSupabase is available
    const user = getCurrentUser();
    if (user !== "Guest" && typeof window.syncPortfolioToSupabase === "function") {
        window.syncPortfolioToSupabase(user, holdings);
    }
}
