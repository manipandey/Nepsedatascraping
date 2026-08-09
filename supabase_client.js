/**
 * ====================================================================
 * SUPABASE CLIENT INTEGRATION FOR NEPSE TERMINAL (VERCEL DEPLOYMENT)
 * ====================================================================
 */

window.SUPABASE_CONFIG = {
    url: window.ENV_SUPABASE_URL || "https://your-project-id.supabase.co",
    anonKey: window.ENV_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY"
};

let supabaseClient = null;

function initSupabaseClient() {
    if (typeof supabase !== "undefined" && window.SUPABASE_CONFIG.url && !window.SUPABASE_CONFIG.url.includes("your-project-id")) {
        try {
            supabaseClient = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
            console.log("[Supabase Client] Successfully initialized Supabase database connection.");
            return true;
        } catch (e) {
            console.warn("[Supabase Client] Initialization error:", e);
        }
    }
    console.log("[Supabase Client] Running in JSON static fallback mode for Vercel deployment.");
    return false;
}

// Fetch Companies Master Data from Supabase with Fallback
async function fetchSupabaseCompanies() {
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from("companies")
                .select("*")
                .order("symbol");
            if (!error && data) return data;
        } catch (e) {
            console.error("[Supabase Client] Companies fetch error:", e);
        }
    }
    return null;
}

// Fetch Daily Prices Data from Supabase with Fallback
async function fetchSupabaseDailyPrices() {
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from("daily_prices")
                .select("*, companies(name, sector)")
                .order("date", { ascending: false });
            if (!error && data) return data;
        } catch (e) {
            console.error("[Supabase Client] Daily Prices fetch error:", e);
        }
    }
    return null;
}

// Fetch 360° Real Fundamentals from Supabase with Fallback
async function fetchSupabaseFundamentals(symbol) {
    if (supabaseClient && symbol) {
        try {
            const { data, error } = await supabaseClient
                .from("company_fundamentals")
                .select("*")
                .eq("symbol", symbol.toUpperCase())
                .single();
            if (!error && data) return data;
        } catch (e) {
            console.error("[Supabase Client] Fundamentals fetch error:", e);
        }
    }
    return null;
}

// ====================================================================
// USER AUTHENTICATION & PORTFOLIO MANAGEMENT API
// ====================================================================

// 1. User Sign Up
async function signUpUser(email, password, fullName) {
    if (!supabaseClient) return { error: { message: "Supabase client not configured." } };
    return await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
    });
}

// 2. User Sign In
async function signInUser(email, password) {
    if (!supabaseClient) return { error: { message: "Supabase client not configured." } };
    return await supabaseClient.auth.signInWithPassword({ email, password });
}

// 3. User Sign Out
async function signOutUser() {
    if (!supabaseClient) return;
    return await supabaseClient.auth.signOut();
}

// 4. Get User Portfolios
async function getUserPortfolios() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
        .from("portfolios")
        .select("*, portfolio_holdings(*)")
        .order("created_at");
    if (error) console.error("[Supabase] Portfolios fetch error:", error);
    return data;
}

// 5. Add Stock Holding to User Portfolio
async function addPortfolioHolding(portfolioId, symbol, quantity, buyPrice, setupTag = "Swing Trade", notes = "") {
    if (!supabaseClient) return null;
    const user = (await supabaseClient.auth.getUser()).data.user;
    if (!user) return { error: "User not authenticated." };

    const { data, error } = await supabaseClient
        .from("portfolio_holdings")
        .insert([{
            portfolio_id: portfolioId,
            user_id: user.id,
            symbol: symbol.toUpperCase(),
            quantity: parseFloat(quantity),
            buy_price: parseFloat(buyPrice),
            setup_tag: setupTag,
            notes: notes
        }]);

    if (error) console.error("[Supabase] Add holding error:", error);
    return { data, error };
}

// 6. Delete Portfolio Holding Position
async function deletePortfolioHolding(holdingId) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
        .from("portfolio_holdings")
        .delete()
        .eq("id", holdingId);
    return { data, error };
}

// 7. Create User Price / Technical Signal Alert
async function createUserAlert(symbol, alertType, targetPrice = null, targetRsi = null, notes = "") {
    if (!supabaseClient) return { error: "Supabase client not configured." };
    const user = (await supabaseClient.auth.getUser()).data.user;
    if (!user) return { error: "User not authenticated." };

    const { data, error } = await supabaseClient
        .from("user_alerts")
        .insert([{
            user_id: user.id,
            symbol: symbol.toUpperCase(),
            alert_type: alertType,
            target_price: targetPrice ? parseFloat(targetPrice) : null,
            target_rsi: targetRsi ? parseFloat(targetRsi) : null,
            notes: notes,
            is_active: true
        }]);

    if (error) console.error("[Supabase] Create alert error:", error);
    return { data, error };
}

// 8. Get User Active Alerts
async function getUserAlerts() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
        .from("user_alerts")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) console.error("[Supabase] Alerts fetch error:", error);
    return data;
}

// 9. Delete User Alert
async function deleteUserAlert(alertId) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
        .from("user_alerts")
        .delete()
        .eq("id", alertId);
    return { data, error };
}

// 10. Get User Unread Notifications
async function getUserNotifications() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
        .from("alert_notifications")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) console.error("[Supabase] Notifications fetch error:", error);
    return data;
}

// Global initialization
document.addEventListener("DOMContentLoaded", () => {
    initSupabaseClient();
});
