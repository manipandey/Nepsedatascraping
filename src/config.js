/**
 * Application Configuration & Supabase Credentials
 */

export const CONFIG = {
    APP_NAME: "NEPSE Terminal",
    VERSION: "4.0.0",
    LIVE_REFRESH_INTERVAL_MS: 30000, // 30s auto-refresh interval
    SUPABASE_URL: window.ENV_SUPABASE_URL || "https://epvlpmizvswjgozpfrfz.supabase.co",
    SUPABASE_ANON_KEY: window.ENV_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdmxwbWl6dnN3amdvenBmcmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNDY2MDIsImV4cCI6MjEwMTgyMjYwMn0.tKpz6cSOejAx-YWngWcwgKrqA6mLveqWD0-Lzpp3WUk"
};
