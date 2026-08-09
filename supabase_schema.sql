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

-- 8. MARKET SUMMARY HISTORY TABLE (Daily NEPSE Overall Stats)
CREATE TABLE IF NOT EXISTS public.market_history (
    date DATE PRIMARY KEY,
    nepse_index NUMERIC(12, 2) NOT NULL,
    point_change NUMERIC(12, 2) NOT NULL,
    percentage_change NUMERIC(8, 4) NOT NULL,
    total_turnover NUMERIC(18, 2) NOT NULL,
    total_volume BIGINT NOT NULL,
    total_transactions INTEGER DEFAULT 0,
    advancers INTEGER DEFAULT 0,
    decliners INTEGER DEFAULT 0,
    unchanged INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_history_date ON public.market_history(date DESC);

-- ====================================================================
-- USER PORTFOLIOS & WATCHLIST TABLES (Auth-free, tracked by Username)
-- ====================================================================

-- 9. USER PORTFOLIOS TABLE
CREATE TABLE IF NOT EXISTS public.portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portfolios_username ON public.portfolios(username);

-- 10. PORTFOLIO HOLDINGS & POSITIONS TABLE
CREATE TABLE IF NOT EXISTS public.portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    buy_price NUMERIC(12, 2) NOT NULL CHECK (buy_price >= 0),
    setup_tag TEXT DEFAULT 'Swing Trade',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holdings_username_portfolio ON public.portfolio_holdings(username, portfolio_id);

-- 11. USER CUSTOM WATCHLISTS TABLE
CREATE TABLE IF NOT EXISTS public.user_watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    target_buy_price NUMERIC(12, 2),
    target_sell_price NUMERIC(12, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_user_symbol_watchlist UNIQUE (username, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_username ON public.user_watchlists(username);

-- 12. USER PRICE & SIGNAL ALERTS TABLE
CREATE TABLE IF NOT EXISTS public.user_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    alert_type TEXT NOT NULL DEFAULT 'PRICE_ABOVE',
    target_price NUMERIC(12, 2),
    target_rsi NUMERIC(5, 2),
    notification_channel TEXT DEFAULT 'WEB',
    is_active BOOLEAN DEFAULT TRUE,
    is_triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_username ON public.user_alerts(username);

-- 13. ALERT NOTIFICATIONS HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.alert_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    alert_id UUID REFERENCES public.user_alerts(id) ON DELETE SET NULL,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    triggered_price NUMERIC(12, 2),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_username_unread ON public.alert_notifications(username, is_read, created_at DESC);

-- 14. USER TRADE JOURNAL TABLE
CREATE TABLE IF NOT EXISTS public.trade_journal (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    date DATE NOT NULL,
    symbol TEXT NOT NULL REFERENCES public.companies(symbol) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'BUY', -- 'BUY', 'SELL'
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    entry_price NUMERIC(12, 2) NOT NULL CHECK (entry_price >= 0),
    exit_price NUMERIC(12, 2) NOT NULL CHECK (exit_price >= 0),
    tp NUMERIC(12, 2),
    sl NUMERIC(12, 2),
    setup_tag TEXT DEFAULT 'Swing Trade',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_username ON public.trade_journal(username);

-- ====================================================================
-- DISABLE ROW LEVEL SECURITY (RLS)
-- Disables protection limits to allow easy public CRUD operations
-- ====================================================================
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_prices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_fundamentals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_structures DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lockin_tracker DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_calendar DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_holdings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_watchlists DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_journal DISABLE ROW LEVEL SECURITY;
