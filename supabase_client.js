/**
 * ====================================================================
 * SUPABASE CLIENT INTEGRATION FOR NEPSE TERMINAL (VERCEL DEPLOYMENT)
 * Auth-free, Username-based Cloud Database Syncing
 * ====================================================================
 */

window.SUPABASE_CONFIG = {
    // These will be overridden by Vercel deployment environment variables or client-side runtime config
    url: window.ENV_SUPABASE_URL || "https://your-project-id.supabase.co",
    anonKey: window.ENV_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY"
};

let supabaseClient = null;

function initSupabaseClient() {
    if (typeof supabase !== "undefined" && window.SUPABASE_CONFIG.url && !window.SUPABASE_CONFIG.url.includes("your-project-id")) {
        try {
            supabaseClient = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
            console.log("[Supabase Client] Successfully initialized connection.");
            return true;
        } catch (e) {
            console.warn("[Supabase Client] Initialization error:", e);
        }
    }
    console.log("[Supabase Client] Running in local offline storage mode.");
    return false;
}

function isSupabaseAvailable() {
    return !!supabaseClient;
}

// Get or Create Default Portfolio ID for a username
async function getOrCreatePortfolioId(username) {
    if (!supabaseClient) return null;
    try {
        // Fetch default portfolio
        const { data, error } = await supabaseClient
            .from("portfolios")
            .select("id")
            .eq("username", username)
            .eq("is_default", true)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            return data[0].id;
        } else {
            // Create default portfolio
            const { data: newPort, error: createError } = await supabaseClient
                .from("portfolios")
                .insert([{
                    username: username,
                    name: "Main Portfolio",
                    description: "Primary NEPSE Stock Investment Portfolio",
                    is_default: true
                }])
                .select("id");

            if (createError) throw createError;
            return newPort[0].id;
        }
    } catch (e) {
        console.error("[Supabase Client] getOrCreatePortfolioId error:", e);
        return null;
    }
}

/**
 * Sync From Supabase
 * Pulls holdings and journal entries for the specified username from Supabase.
 * If no portfolio/journal entries exist in Supabase for this username, it pushes local data to Supabase instead.
 */
async function syncFromSupabase(username, localHoldings = [], localJournal = []) {
    if (!supabaseClient) return null;
    try {
        const portfolioId = await getOrCreatePortfolioId(username);
        if (!portfolioId) return null;

        // Fetch holdings
        const { data: holdingsData, error: holdingsError } = await supabaseClient
            .from("portfolio_holdings")
            .select("*")
            .eq("portfolio_id", portfolioId);

        if (holdingsError) throw holdingsError;

        // Fetch journal
        const { data: journalData, error: journalError } = await supabaseClient
            .from("trade_journal")
            .select("*")
            .eq("username", username)
            .order("date", { ascending: false });

        if (journalError) throw journalError;

        const hasRemoteData = (holdingsData && holdingsData.length > 0) || (journalData && journalData.length > 0);

        if (!hasRemoteData) {
            // No remote data: upload local data to Supabase to initialize cloud backup
            console.log(`[Supabase Client] No remote data found for '${username}'. Initializing Supabase with local data...`);
            await syncToSupabase(username, localHoldings, localJournal);
            return null;
        }

        // Map remote data back to local arrays
        const holdings = holdingsData.map(h => ({
            id: h.id, // Keep remote UUID to allow edits
            symbol: h.symbol,
            shares: parseInt(h.quantity, 10),
            buyPrice: parseFloat(h.buy_price),
            tp: h.setup_tag.includes("TP:") ? parseFloat(h.setup_tag.split("TP:")[1].split("|")[0]) : null,
            sl: h.setup_tag.includes("SL:") ? parseFloat(h.setup_tag.split("SL:")[1]) : null,
            setup: h.setup_tag.split(" [")[0] || "Swing Trade",
            notes: h.notes || ""
        }));

        const journal = journalData.map(j => ({
            id: j.id,
            date: j.date,
            symbol: j.symbol,
            type: j.type,
            qty: parseInt(j.quantity, 10),
            entry: parseFloat(j.entry_price),
            exit: parseFloat(j.exit_price),
            tp: j.tp ? parseFloat(j.tp) : null,
            sl: j.sl ? parseFloat(j.sl) : null,
            setup: j.setup_tag || "Swing Trade",
            notes: j.notes || ""
        }));

        console.log(`[Supabase Client] Successfully synced ${holdings.length} holdings and ${journal.length} journal entries for '${username}'.`);
        return { holdings, journal };
    } catch (e) {
        console.error("[Supabase Client] Sync pull error:", e);
        return null;
    }
}

/**
 * Sync To Supabase
 * Performs a clean batch overwrite of Supabase tables for the given username.
 */
async function syncToSupabase(username, localHoldings = [], localJournal = []) {
    if (!supabaseClient) return false;
    try {
        const portfolioId = await getOrCreatePortfolioId(username);
        if (!portfolioId) return false;

        // 1. Overwrite Portfolio Holdings
        // Delete all old holdings for this portfolio
        const { error: delHoldingsErr } = await supabaseClient
            .from("portfolio_holdings")
            .delete()
            .eq("portfolio_id", portfolioId);

        if (delHoldingsErr) throw delHoldingsErr;

        // Insert new holdings
        if (localHoldings.length > 0) {
            const holdingsBatch = localHoldings.map(h => ({
                portfolio_id: portfolioId,
                username: username,
                symbol: h.symbol.toUpperCase().strip ? h.symbol.toUpperCase().strip() : h.symbol.toUpperCase(),
                quantity: h.shares,
                buy_price: h.buyPrice,
                // Embed TP and SL info inside setup_tag for backward compatibility with schema
                setup_tag: `${h.setup || 'Swing Trade'} [TP:${h.tp || ''}|SL:${h.sl || ''}]`,
                notes: h.notes || ""
            }));

            const { error: insHoldingsErr } = await supabaseClient
                .from("portfolio_holdings")
                .insert(holdingsBatch);

            if (insHoldingsErr) throw insHoldingsErr;
        }

        // 2. Overwrite Trade Journal
        // Delete all old journal entries for this username
        const { error: delJournalErr } = await supabaseClient
            .from("trade_journal")
            .delete()
            .eq("username", username);

        if (delJournalErr) throw delJournalErr;

        // Insert new journal entries
        if (localJournal.length > 0) {
            const journalBatch = localJournal.map(j => ({
                username: username,
                date: j.date || new Date().toISOString().split("T")[0],
                symbol: j.symbol.toUpperCase().strip ? j.symbol.toUpperCase().strip() : j.symbol.toUpperCase(),
                type: j.type || "BUY",
                quantity: j.qty,
                entry_price: j.entry,
                exit_price: j.exit || j.entry,
                tp: j.tp,
                sl: j.sl,
                setup_tag: j.setup || "Swing Trade",
                notes: j.notes || ""
            }));

            const { error: insJournalErr } = await supabaseClient
                .from("trade_journal")
                .insert(journalBatch);

            if (insJournalErr) throw insJournalErr;
        }

        console.log(`[Supabase Client] Successfully synced local state to cloud for '${username}'.`);
        return true;
    } catch (e) {
        console.error("[Supabase Client] Sync push error:", e);
        return false;
    }
}

// Global initialization
document.addEventListener("DOMContentLoaded", () => {
    initSupabaseClient();
});
