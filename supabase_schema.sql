-- ====================================================================
-- SUPABASE POSTGRESQL DATABASE SCHEMA FOR NEPSE TERMINAL
-- Copy and run this script in your Supabase SQL Editor (https://app.supabase.com)
-- ====================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COMPANIES MASTER TABLE
CREATE TABLE IF NOT EXISTS public.companies (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    industry TEXT,
    listed_since DATE,
    website TEXT,
    head_office TEXT,
    registrar TEXT,
    fiscal_year TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_sector ON public.companies(sector);

-- 2. DAILY PRICES & LIVE TICKERS TABLE
CREATE TABLE IF NOT EXISTS public.daily_prices (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    date DATE NOT NULL,
    open NUMERIC(12, 2) NOT NULL,
    high NUMERIC(12, 2) NOT NULL,
    low NUMERIC(12, 2) NOT NULL,
    close NUMERIC(12, 2) NOT NULL,
    change_npr NUMERIC(12, 2) DEFAULT 0.0,
    change_pct NUMERIC(8, 4) DEFAULT 0.0,
    volume BIGINT DEFAULT 0,
    turnover NUMERIC(16, 2) DEFAULT 0.0,
    transactions INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_symbol_date UNIQUE (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_symbol_date ON public.daily_prices(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON public.daily_prices(date DESC);

-- 3. COMPANY REAL FUNDAMENTALS TABLE
CREATE TABLE IF NOT EXISTS public.company_fundamentals (
    symbol TEXT PRIMARY KEY REFERENCES public.companies(symbol) ON DELETE CASCADE,
    quarter TEXT DEFAULT 'Q3 2080/81',
    eps NUMERIC(10, 2) DEFAULT 0.0,
    book_value NUMERIC(10, 2) DEFAULT 0.0,
    pe_ratio NUMERIC(10, 2) DEFAULT 0.0,
    pb_ratio NUMERIC(10, 2) DEFAULT 0.0,
    roe_pct NUMERIC(8, 2) DEFAULT 0.0,
    roa_pct NUMERIC(8, 2) DEFAULT 0.0,
    net_worth NUMERIC(16, 2) DEFAULT 0.0,
    revenue NUMERIC(16, 2) DEFAULT 0.0,
    net_profit NUMERIC(16, 2) DEFAULT 0.0,
    cash_flow NUMERIC(16, 2) DEFAULT 0.0,
    paid_up_capital NUMERIC(16, 2) DEFAULT 0.0,
    market_cap NUMERIC(18, 2) DEFAULT 0.0,
    fair_value NUMERIC(12, 2) DEFAULT 0.0,
    upside_pct NUMERIC(8, 2) DEFAULT 0.0,
    ai_score INTEGER DEFAULT 80,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. SHARE STRUCTURES TABLE
CREATE TABLE IF NOT EXISTS public.share_structures (
    symbol TEXT PRIMARY KEY REFERENCES public.companies(symbol) ON DELETE CASCADE,
    total_shares BIGINT DEFAULT 0,
    promoter_shares BIGINT DEFAULT 0,
    public_shares BIGINT DEFAULT 0,
    promoter_pct NUMERIC(5, 2) DEFAULT 0.0,
    public_pct NUMERIC(5, 2) DEFAULT 0.0,
    float_shares BIGINT DEFAULT 0,
    locked_shares BIGINT DEFAULT 0,
    is_permanently_locked BOOLEAN DEFAULT FALSE,
    lockin_reason TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. LOCK-IN TRACKER TABLE
CREATE TABLE IF NOT EXISTS public.lockin_tracker (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    event_type TEXT NOT NULL DEFAULT 'Promoter Lock-in Expiry',
    expiry_date DATE NOT NULL,
    shares_unlocking BIGINT NOT NULL,
    market_value NUMERIC(18, 2) DEFAULT 0.0,
    expected_selling_pressure TEXT DEFAULT 'Low',
    status TEXT DEFAULT 'Upcoming',
    days_remaining INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lockin_expiry_date ON public.lockin_tracker(expiry_date);

-- 6. DIVIDEND HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.dividend_history (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    fiscal_year TEXT NOT NULL,
    cash_dividend_pct NUMERIC(6, 2) DEFAULT 0.0,
    bonus_shares_pct NUMERIC(6, 2) DEFAULT 0.0,
    right_shares_pct NUMERIC(6, 2) DEFAULT 0.0,
    total_dividend_pct NUMERIC(6, 2) DEFAULT 0.0,
    book_closure_date DATE,
    agm_date DATE,
    dividend_yield_pct NUMERIC(6, 2) DEFAULT 0.0,
    payout_ratio_pct NUMERIC(6, 2) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dividend_symbol ON public.dividend_history(symbol);

-- 7. CORPORATE CALENDAR TABLE
CREATE TABLE IF NOT EXISTS public.corporate_calendar (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_date DATE NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'Upcoming',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_event_date ON public.corporate_calendar(event_date DESC);

-- ====================================================================
-- USER AUTHENTICATION, PORTFOLIOS & WATCHLIST TABLES
-- Multi-tenant isolation powered by Supabase Auth (auth.users) & RLS
-- ====================================================================

-- 8. USER PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to automatically create a profile when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        new.id,
        new.email,
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'avatar_url'
    );
    
    -- Also create a default main portfolio for the new user
    INSERT INTO public.portfolios (user_id, name, description, is_default)
    VALUES (
        new.id,
        'Main Equity Portfolio',
        'Primary NEPSE Stock Investment Portfolio',
        TRUE
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. USER PORTFOLIOS TABLE
CREATE TABLE IF NOT EXISTS public.portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON public.portfolios(user_id);

-- 10. PORTFOLIO HOLDINGS & POSITIONS TABLE
CREATE TABLE IF NOT EXISTS public.portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    buy_price NUMERIC(12, 2) NOT NULL CHECK (buy_price >= 0),
    setup_tag TEXT DEFAULT 'Swing Trade',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holdings_user_portfolio ON public.portfolio_holdings(user_id, portfolio_id);

-- 11. USER CUSTOM WATCHLISTS & ALERTS TABLE
CREATE TABLE IF NOT EXISTS public.user_watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    target_buy_price NUMERIC(12, 2),
    target_sell_price NUMERIC(12, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_user_symbol_watchlist UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON public.user_watchlists(user_id);

-- 12. USER PRICE & SIGNAL ALERTS TABLE
CREATE TABLE IF NOT EXISTS public.user_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    alert_type TEXT NOT NULL DEFAULT 'PRICE_ABOVE', -- 'PRICE_ABOVE', 'PRICE_BELOW', 'RSI_OVERSOLD', 'RSI_OVERBOUGHT', 'BREAKOUT_SURGE', 'LOCKIN_EXPIRY_NEAR'
    target_price NUMERIC(12, 2),
    target_rsi NUMERIC(5, 2),
    notification_channel TEXT DEFAULT 'WEB', -- 'WEB', 'EMAIL', 'TELEGRAM'
    is_active BOOLEAN DEFAULT TRUE,
    is_triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_active ON public.user_alerts(user_id, symbol) WHERE is_active = TRUE;

-- 13. ALERT NOTIFICATIONS HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.alert_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES public.user_alerts(id) ON DELETE SET NULL,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    triggered_price NUMERIC(12, 2),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.alert_notifications(user_id, is_read, created_at DESC);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Isolation: Users can ONLY access & modify THEIR OWN data!
-- ====================================================================

-- Market Data RLS (Public Read)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_fundamentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lockin_tracker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Public Read Companies" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Allow Public Read Daily Prices" ON public.daily_prices FOR SELECT USING (true);
CREATE POLICY "Allow Public Read Fundamentals" ON public.company_fundamentals FOR SELECT USING (true);
CREATE POLICY "Allow Public Read Share Structures" ON public.share_structures FOR SELECT USING (true);
CREATE POLICY "Allow Public Read Lockin Tracker" ON public.lockin_tracker FOR SELECT USING (true);
CREATE POLICY "Allow Public Read Dividend History" ON public.dividend_history FOR SELECT USING (true);
CREATE POLICY "Allow Public Read Corporate Calendar" ON public.corporate_calendar FOR SELECT USING (true);

-- User Data RLS (Strict Owner Isolation: auth.uid() = user_id / id)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Portfolios Policies
CREATE POLICY "Users can view own portfolios" ON public.portfolios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolios" ON public.portfolios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolios" ON public.portfolios FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolios" ON public.portfolios FOR DELETE USING (auth.uid() = user_id);

-- Holdings Policies
CREATE POLICY "Users can view own holdings" ON public.portfolio_holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings" ON public.portfolio_holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings" ON public.portfolio_holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holdings" ON public.portfolio_holdings FOR DELETE USING (auth.uid() = user_id);

-- Watchlist Policies
CREATE POLICY "Users can view own watchlists" ON public.user_watchlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlists" ON public.user_watchlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own watchlists" ON public.user_watchlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlists" ON public.user_watchlists FOR DELETE USING (auth.uid() = user_id);

-- Alerts Policies
CREATE POLICY "Users can view own alerts" ON public.user_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.user_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.user_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON public.user_alerts FOR DELETE USING (auth.uid() = user_id);

-- Notifications Policies
CREATE POLICY "Users can view own notifications" ON public.alert_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.alert_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.alert_notifications FOR DELETE USING (auth.uid() = user_id);


