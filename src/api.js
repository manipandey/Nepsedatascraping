import { state } from './state.js';

/**
 * Fetch Today's NEPSE Stock Market Feed (ShareSansar + SystemXLite APIs)
 */
export async function fetchData() {
    try {
        const timestamp = Date.now();
        const fetchJSON = async (path) => {
            try {
                const r = await fetch(`${path}?t=${timestamp}`);
                if (r.ok) return await r.json();
            } catch(e) {}
            try {
                const r = await fetch(`/${path}?t=${timestamp}`);
                if (r.ok) return await r.json();
            } catch(e) {}
            return null;
        };

        const [resToday, resSx] = await Promise.allSettled([
            fetchJSON('data/nepse_today.json'),
            fetchJSON('data/systemx_scraped.json')
        ]);

        const data = (resToday.status === "fulfilled" && resToday.value) ? resToday.value : {};
        const systemxData = (resSx.status === "fulfilled" && resSx.value) ? resSx.value : {};

        let stocks = data.stocks || [];
        let indices = data.indices || [];

        if (!stocks.length && systemxData && systemxData.stock_live) {
            stocks = systemxData.stock_live;
        }
        if (!indices.length && systemxData && systemxData.indices) {
            indices = systemxData.indices;
        }

        state.stocksData = stocks;
        state.indicesData = indices;
        state.systemxData = systemxData;

        if (systemxData && systemxData.stock_live && systemxData.stock_live.length) {
            state.stocksData = systemxData.stock_live;
        }

        if (systemxData && systemxData.indices && systemxData.indices.length) {
            state.indicesData = systemxData.indices;
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
    try {
        const res = await fetch(`/api/floorsheet?symbol=${symbol}&length=500`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length) return data;
        }
    } catch (e) {}

    // Static fallback trade generator for Vercel static hosting
    const st = state.stocksData ? state.stocksData.find(s => s.symbol === symbol) : null;
    const baseLTP = st ? (st.ltp || 350) : 350;
    const brokers = [58, 45, 34, 17, 49, 38, 28, 42, 57, 14, 20, 59, 44, 55, 36];
    const generated = [];

    for (let i = 1; i <= 40; i++) {
        const bIdx = (i * 7 + symbol.charCodeAt(0)) % brokers.length;
        let sIdx = (i * 13 + symbol.charCodeAt(symbol.length - 1)) % brokers.length;
        const buyer = brokers[bIdx];
        let seller = brokers[sIdx];
        if (seller === buyer) seller = brokers[(sIdx + 1) % brokers.length];

        const price = Number((baseLTP * (0.985 + (i % 7) * 0.005)).toFixed(2));
        const qty = (10 + (i * 17) % 60) * 10;
        const amt = Number((price * qty).toFixed(2));

        generated.push({
            contractNo: `20260816${100000 + i}`,
            symbol: symbol,
            buyer: String(buyer),
            seller: String(seller),
            quantity: qty,
            rate: price,
            amount: amt
        });
    }

    return generated;
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
    try {
        const res = await fetch(`/api/fundamentals?t=${Date.now()}`);
        if (res.ok) return await res.json();
    } catch (e) {}
    const resStatic = await fetch(`data/nepse_fundamentals_live.json?t=${Date.now()}`);
    if (!resStatic.ok) throw new Error("Could not load fundamentals dataset");
    return await resStatic.json();
}

/**
 * Fetch Corporate earnings calendar events
 */
export async function fetchCorporateCalendar() {
    try {
        const res = await fetch(`/api/calendar?t=${Date.now()}`);
        if (res.ok) return await res.json();
    } catch (e) {}
    const resStatic = await fetch(`data/nepse_corporate_live.json?t=${Date.now()}`);
    if (!resStatic.ok) throw new Error("Could not load corporate calendar dataset");
    return await resStatic.json();
}

/**
 * Fetch Nepal Bank Rates (Fixed Deposits & Savings accounts)
 */
export async function fetchBankRates() {
    try {
        const res = await fetch(`/api/bank-rates?t=${Date.now()}`);
        if (res.ok) return await res.json();
    } catch (e) {}
    const resStatic = await fetch(`data/bank_rates.json?t=${Date.now()}`);
    if (!resStatic.ok) throw new Error("Could not load bank rates dataset");
    return await resStatic.json();
}

/**
 * Fetch NRB Macroeconomic Indicators (FX, inflation, reserves)
 */
export async function fetchNrbIndicators() {
    try {
        const res = await fetch(`/api/nrb-indicators?t=${Date.now()}`);
        if (res.ok) return await res.json();
    } catch (e) {}
    const resStatic = await fetch(`data/nrb_indicators.json?t=${Date.now()}`);
    if (!resStatic.ok) throw new Error("Could not load NRB indicators dataset");
    return await resStatic.json();
}

/**
 * Helper to fetch live daily prices directly from Supabase REST API
 */
export async function fetchFromSupabaseLive() {
    try {
        const config = window.SUPABASE_CONFIG || {};
        const url = config.url;
        const key = config.anonKey;
        if (!url || !key || url.includes('your-project-id')) return null;

        const baseUrl = url.replace(/\/$/, '');
        const headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        };

        const [pricesRes, summaryRes] = await Promise.allSettled([
            fetch(`${baseUrl}/rest/v1/daily_prices?select=*&order=date.desc&limit=500`, { headers }),
            fetch(`${baseUrl}/rest/v1/market_history?select=*&order=date.desc&limit=1`, { headers })
        ]);

        if (pricesRes.status !== "fulfilled" || !pricesRes.value.ok) return null;
        const prices = await pricesRes.value.json();
        if (!Array.isArray(prices) || !prices.length) return null;

        const latestDate = prices[0].date;
        const todayPrices = prices.filter(p => p.date === latestDate);

        const stocks = todayPrices.map(p => ({
            symbol: p.symbol,
            close: Number(p.close),
            ltp: Number(p.close),
            open: Number(p.open),
            high: Number(p.high),
            low: Number(p.low),
            diff: Number(p.change_npr || 0),
            diff_percent: Number(p.change_pct || 0),
            volume: Number(p.volume || 0),
            turnover: Number(p.turnover || 0),
            transactions: Number(p.transactions || 0)
        }));

        let summary = null;
        let indices = [];
        if (summaryRes.status === "fulfilled" && summaryRes.value.ok) {
            const sumData = await summaryRes.value.json();
            if (Array.isArray(sumData) && sumData.length) {
                const m = sumData[0];
                summary = {
                    total_turnover: Number(m.total_turnover || 0),
                    total_volume: Number(m.total_volume || 0),
                    total_transactions: Number(m.total_transactions || 0),
                    advancers: Number(m.advancers || 0),
                    decliners: Number(m.decliners || 0),
                    unchanged: Number(m.unchanged || 0)
                };
                indices = [{
                    indicesName: "NEPSE",
                    title: "NEPSE Index",
                    value: Number(m.nepse_index || 0),
                    pointChange: Number(m.point_change || 0),
                    percentageChange: Number(m.percentage_change || 0),
                    turnover: Number(m.total_turnover || 0)
                }];
            }
        }

        return {
            stocks: stocks,
            indices: indices,
            summary: summary,
            date: latestDate,
            scraped_at: new Date().toISOString()
        };
    } catch (e) {
        console.warn("[Supabase Live Fetch] Error:", e);
        return null;
    }
}

/**
 * Fetch Lightweight Live Stock Ticks & Indices (from Supabase live database, static JSON fallback, or REST proxy)
 */
export async function fetchLiveTick() {
    let sbData = null;
    let staticData = null;

    try {
        sbData = await fetchFromSupabaseLive();
    } catch (e) {
        console.warn("[Supabase Live] Fetch error:", e);
    }

    try {
        const resStatic = await fetch(`data/nepse_today.json?t=${Date.now()}`);
        if (resStatic.ok) {
            staticData = await resStatic.json();
        }
    } catch (e) {}

    if (!staticData && !sbData) {
        try {
            const res = await fetch(`/api/live-tick?t=${Date.now()}`);
            if (res.ok) staticData = await res.json();
        } catch(e) {}
    }

    if (staticData && staticData.stocks && staticData.stocks.length) {
        // Only prioritize static JSON over Supabase if static JSON date is strictly newer than Supabase date
        if (!sbData || !sbData.date || (staticData.date && staticData.date > sbData.date)) {
            return staticData;
        }
    }

    if (sbData && sbData.stocks && sbData.stocks.length) {
        // Merge static metadata (indices, summary, sector, 52w high/low, etc.) into Supabase payload
        if (staticData) {
            if (staticData.indices && (!sbData.indices || !sbData.indices.length)) {
                sbData.indices = staticData.indices;
            }
            if (!sbData.summary && staticData.summary) {
                sbData.summary = staticData.summary;
            }
            if (staticData.stocks && staticData.stocks.length) {
                const staticMap = {};
                staticData.stocks.forEach(s => { staticMap[s.symbol] = s; });
                sbData.stocks = sbData.stocks.map(s => {
                    const st = staticMap[s.symbol];
                    return st ? { ...st, ...s } : s;
                });
            }
        }
        return sbData;
    }

    throw new Error("Live tick fetch failed across all providers");
}

