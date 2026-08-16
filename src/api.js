import { state } from './state.js';

/**
 * Fetch Today's NEPSE Stock Market Feed (ShareSansar + SystemXLite APIs)
 */
export async function fetchData() {
    try {
        const timestamp = Date.now();
        const res = await fetch(`data/nepse_today.json?t=${timestamp}`);
        const data = await res.json();

        state.stocksData = data.stocks || [];
        state.indicesData = data.indices || [];

        try {
            const resSx = await fetch(`data/systemx_scraped.json?t=${timestamp}`);
            const systemxData = await resSx.json();
            state.systemxData = systemxData;

            if (systemxData && systemxData.stock_live && systemxData.stock_live.length) {
                const sxMap = {};
                systemxData.stock_live.forEach(s => { sxMap[s.symbol] = s; });

                if (!state.stocksData || !state.stocksData.length) {
                    state.stocksData = systemxData.stock_live;
                } else {
                    state.stocksData.forEach(s => {
                        const sx = sxMap[s.symbol];
                        if (sx) {
                            if (sx.ltp) s.ltp = sx.ltp;
                            if (sx.close) s.close = sx.close;
                            if (sx.diff !== undefined) s.diff = sx.diff;
                            if (sx.diff_percent !== undefined) s.diff_percent = sx.diff_percent;
                            if (sx.volume) s.volume = sx.volume;
                            if (sx.turnover) s.turnover = sx.turnover;
                        }
                    });
                }
            }

            if (systemxData && systemxData.indices && systemxData.indices.length) {
                state.indicesData = systemxData.indices;
            }
        } catch (e) {
            console.log("systemx_scraped fetch notice:", e);
        }

        const todayStr = new Date().toISOString().split("T")[0];
        const dateEl = document.getElementById("tradeDate");
        if (dateEl) dateEl.textContent = `${data.date || todayStr} (Live)`;

        const scrapedAt = data.scraped_at;
        const updEl = document.getElementById("lastUpdatedTime");
        if (updEl && scrapedAt) {
            const d = new Date(scrapedAt);
            const timeStr = isNaN(d) ? scrapedAt : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            updEl.textContent = `🟢 Live Real-Time Feed • Updated ${timeStr}`;
        }
        return data;
    } catch (err) {
        console.error("fetchData error:", err);
        throw err;
    }
}

/**
 * Load Full 329+ Tickers master dataset
 */
export async function loadMasterTickers() {
    try {
        const res = await fetch("data/nepse_master_tickers.json");
        if (res.ok) {
            state.masterTickers = await res.json();
        }
    } catch (e) {
        console.warn("Could not load master tickers:", e);
    }
}

/**
 * Trigger Live Market Data scrape (triggers local scraper via REST API proxy)
 */
export async function triggerLiveScrape() {
    const res = await fetch("/api/scrape");
    if (!res.ok) {
        throw new Error(`Scrape proxy error: ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Fetch floorsheet data for a stock symbol
 */
export async function fetchFloorsheetData(symbol) {
    const res = await fetch(`/api/floorsheet?symbol=${symbol}&length=500`);
    if (!res.ok) {
        throw new Error(`Floorsheet fetch error: ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Fetch Technical Chart patterns scanning data
 */
export async function fetchPatternScanData() {
    const res = await fetch(`/api/patterns?t=${Date.now()}`);
    if (!res.ok) {
        throw new Error(`Pattern scan fetch error: ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Fetch Full Fundamental reports for all scrips
 */
export async function fetchFundamentalsReport() {
    const res = await fetch(`/api/fundamentals?t=${Date.now()}`);
    if (!res.ok) {
        throw new Error(`Fundamentals fetch error: ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Fetch Corporate earnings calendar events
 */
export async function fetchCorporateCalendar() {
    const res = await fetch("/api/calendar");
    if (!res.ok) {
        throw new Error(`Corporate calendar fetch error: ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Fetch Nepal Bank Rates (Fixed Deposits & Savings accounts)
 */
export async function fetchBankRates() {
    const res = await fetch("/api/bank-rates");
    if (!res.ok) {
        throw new Error(`Bank rates fetch error: ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Fetch NRB Macroeconomic Indicators (FX, inflation, reserves)
 */
export async function fetchNrbIndicators() {
    const res = await fetch("/api/nrb-indicators");
    if (!res.ok) {
        throw new Error(`NRB indicators fetch error: ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Fetch Lightweight Live Stock Ticks & Indices (from run.py server)
 */
export async function fetchLiveTick() {
    const res = await fetch(`/api/live-tick?t=${Date.now()}`);
    if (!res.ok) {
        throw new Error(`Live tick fetch error: ${res.statusText}`);
    }
    return await res.json();
}

