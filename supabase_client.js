/**
 * ====================================================================
 * SUPABASE CLIENT INTEGRATION FOR NEPSE TERMINAL (VERCEL DEPLOYMENT)
 * Database-Backed Authentication & Per-User Cloud Data Syncing
 * ====================================================================
 */

window.SUPABASE_CONFIG = {
    // These will be overridden by Vercel deployment environment variables or client-side runtime config
    url: window.ENV_SUPABASE_URL || "https://epvlpmizvswjgozpfrfz.supabase.co",
    anonKey: window.ENV_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmxwbWl6dnN3amdvenBmcmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNDY2MDIsImV4cCI6MjEwMTgyMjYwMn0.tKpz6cSOejAx-YWngWcwgKrqA6mLveqWD0-Lzpp3WUk"
};

let supabaseClient = null;

async function initSupabaseClient() {
    try {
        const res = await fetch("/api/config");
        if (res.ok) {
            const config = await res.json();
            if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
                window.SUPABASE_CONFIG.url = config.SUPABASE_URL;
                window.SUPABASE_CONFIG.anonKey = config.SUPABASE_ANON_KEY;
                console.log("[Supabase Client] Dynamically loaded configuration from local server.");
            }
        }
    } catch (e) {
        // Fallback silently if /api/config is not available (e.g. static host Vercel)
    }

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
 * Sync Watchlist To Supabase
 * Saves the user's watchlist as a JSON blob in the user_preferences table.
 * Uses upsert so it creates or replaces the existing record.
 */
async function syncWatchlistToSupabase(username, watchlist = []) {
    if (!supabaseClient || !username || username === "Guest") return false;
    try {
        const { error } = await supabaseClient
            .from("user_preferences")
            .upsert([
                {
                    username: username,
                    preference_key: "watchlist_v3",
                    preference_value: JSON.stringify(watchlist),
                    updated_at: new Date().toISOString()
                }
            ], { onConflict: "username,preference_key" });

        if (error) throw error;
        console.log(`[Supabase Client] Watchlist synced to cloud for '${username}' (${watchlist.length} items).`);
        return true;
    } catch (e) {
        console.warn("[Supabase Client] syncWatchlistToSupabase error:", e);
        return false;
    }
}

/**
 * Sync Watchlist From Supabase
 * Fetches the user's watchlist blob from the user_preferences table.
 * Returns the parsed watchlist array, or null if not found.
 */
async function syncWatchlistFromSupabase(username) {
    if (!supabaseClient || !username || username === "Guest") return null;
    try {
        const { data, error } = await supabaseClient
            .from("user_preferences")
            .select("preference_value")
            .eq("username", username)
            .eq("preference_key", "watchlist_v3")
            .limit(1);

        if (error) throw error;
        if (data && data.length > 0 && data[0].preference_value) {
            const parsed = JSON.parse(data[0].preference_value);
            console.log(`[Supabase Client] Watchlist loaded from cloud for '${username}' (${parsed.length} items).`);
            return Array.isArray(parsed) ? parsed : null;
        }
        return null;
    } catch (e) {
        console.warn("[Supabase Client] syncWatchlistFromSupabase error:", e);
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

        // Also fetch watchlist from cloud
        const watchlistData = await syncWatchlistFromSupabase(username);

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
        return { holdings, journal, watchlist: watchlistData };
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

/**
 * Authenticate or Create User (One-time simple username & password registration/verification)
 */
async function authenticateOrCreateUser(username, password, action = "login") {
    if (!supabaseClient) {
        // Fallback for offline mode or unit testing
        console.warn("[Supabase Auth] Client not initialized. Simulating success offline.");
        return { success: true, isNew: (action === "signup") };
    }
    try {
        const cleanUsername = username.trim().toLowerCase();
        
        // Check if user exists
        const { data, error } = await supabaseClient
            .from("users")
            .select("password_hash")
            .eq("username", cleanUsername)
            .limit(1);

        if (error) {
            if (error.message && error.message.includes("relation \"public.users\" does not exist")) {
                return { 
                    success: false, 
                    error: "Database table 'users' does not exist. Please run the SQL schema in your Supabase SQL Editor first!" 
                };
            }
            throw error;
        }

        const userExists = data && data.length > 0;

        if (action === "signup") {
            if (userExists) {
                return { success: false, error: "This username is already taken. Please choose a different one or sign in." };
            } else {
                // Register username and password "only one time"
                const { error: insertError } = await supabaseClient
                    .from("users")
                    .insert([{ username: cleanUsername, password_hash: password }]);

                if (insertError) throw insertError;
                console.log(`[Supabase Auth] New user registered successfully: '${cleanUsername}'`);
                return { success: true, isNew: true };
            }
        } else {
            // Sign in
            if (!userExists) {
                return { success: false, error: "Username does not exist. If you are a new user, switch to 'Create a new profile' first!" };
            }
            
            const storedPassword = data[0].password_hash;
            if (storedPassword === password) {
                return { success: true, isNew: false };
            } else {
                return { success: false, error: "Incorrect passcode for this username. Please try again." };
            }
        }
    } catch (e) {
        console.error("[Supabase Auth] Authentication error:", e);
        return { success: false, error: e.message || "Failed to authenticate with database." };
    }
}

// Global initialization
document.addEventListener("DOMContentLoaded", () => {
    initSupabaseClient();
});
