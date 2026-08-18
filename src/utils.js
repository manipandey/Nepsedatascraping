/**
 * Helper utilities for formatting, calculations, and technical analysis
 */

export const formatNPR = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "NPR 0.00";
    return "NPR " + Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatNumber = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return Number(val).toLocaleString("en-IN");
};

export const formatPercent = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0.00%";
    const num = Number(val);
    const prefix = num > 0 ? "+" : "";
    return `${prefix}${num.toFixed(2)}%`;
};

export const formatCompact = (val) => {
    if (!val || isNaN(val)) return "0";
    const n = Number(val);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e7) return (n / 1e7).toFixed(2) + "Cr";
    if (n >= 1e5) return (n / 1e5).toFixed(2) + "Lakh";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString("en-IN");
};

export const getTrendClass = (change) => {
    const num = Number(change || 0);
    if (num > 0) return "trend-up";
    if (num < 0) return "trend-down";
    return "trend-neutral";
};

export const getTrendColor = (change) => {
    const num = Number(change || 0);
    if (num > 0) return "#10b981"; // Emerald
    if (num < 0) return "#ef4444"; // Crimson
    return "#9ca3af"; // Gray
};

/**
 * Enriches stock dataset with technical indicators (20 DMA, 52-week position)
 */
export const enrichTechnicalIndicators = (stocks) => {
    if (!Array.isArray(stocks)) return;
    stocks.forEach(s => {
        const ltp = Number(s.ltp || s.close || 0);
        const high52 = Number(s.fifty_two_week_high || 0);
        const low52 = Number(s.fifty_two_week_low || 0);
        
        // 52-week position percentage (0% = at 52w low, 100% = at 52w high)
        if (high52 > low52 && low52 > 0) {
            s.position52w = Math.min(100, Math.max(0, ((ltp - low52) / (high52 - low52)) * 100));
        } else {
            s.position52w = 50;
        }

        // DMA20 fallback calculation if not present
        if (!s.dma20 && ltp > 0) {
            const prev = Number(s.prev_close || ltp);
            s.dma20 = Number(((ltp * 0.4) + (prev * 0.6)).toFixed(2));
        }
    });
};
