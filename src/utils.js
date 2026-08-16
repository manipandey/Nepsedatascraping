/**
 * Helper utilities for formatting and calculations
 */

export const formatNPR = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "NPR 0.00";
    return "NPR " + Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatNumber = (val) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return Number(val).toLocaleString("en-IN");
};
