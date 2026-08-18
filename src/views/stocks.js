/**
 * Stocks View Component: Interactive Stock Market Scrips Table with Search, Sector Filter, Sorting & Technicals
 */

import { state } from '../state.js';
import { formatNPR, formatNumber, formatPercent, getTrendClass } from '../utils.js';

export function renderStocksView() {
    const container = document.getElementById("view-stocks");
    if (!container) return;

    const stocks = state.stocksData || [];

    // Extract unique sectors for dropdown filter
    const sectors = Array.from(new Set(stocks.map(s => s.sector).filter(Boolean))).sort();

    // Filter stocks by search query & selected sector
    const query = (state.searchQuery || "").toLowerCase().trim();
    const selectedSector = state.selectedSector || "all";

    let filtered = stocks.filter(s => {
        const matchesSearch = !query || 
            (s.symbol && s.symbol.toLowerCase().includes(query)) ||
            (s.fullName && s.fullName.toLowerCase().includes(query)) ||
            (s.sector && s.sector.toLowerCase().includes(query));

        const matchesSector = selectedSector === "all" || s.sector === selectedSector;
        return matchesSearch && matchesSector;
    });

    // Sort stocks
    const col = state.sortColumn || "symbol";
    const dir = state.sortDirection === "desc" ? -1 : 1;

    filtered.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });

    // Pagination
    const page = state.currentPage || 1;
    const perPage = state.rowsPerPage || 25;
    const totalPages = Math.ceil(filtered.length / perPage) || 1;
    const paginated = filtered.slice((page - 1) * perPage, page * perPage);

    container.innerHTML = `
        <div class="card glass-panel mb-4">
            <div class="card-body">
                <div class="filter-controls-row">
                    <div class="search-box">
                        <input type="text" id="stocksSearchInput" class="form-input" placeholder="Search symbol, company name, or sector..." value="${state.searchQuery || ""}">
                    </div>
                    <div class="sector-filter">
                        <select id="stocksSectorSelect" class="form-select">
                            <option value="all">All Sectors (${stocks.length})</option>
                            ${sectors.map(sec => `
                                <option value="${sec}" ${selectedSector === sec ? "selected" : ""}>${sec}</option>
                            `).join("")}
                        </select>
                    </div>
                    <div class="records-badge">
                        Showing ${paginated.length} of ${filtered.length} scrips
                    </div>
                </div>
            </div>
        </div>

        <div class="card glass-panel">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead>
                            <tr>
                                <th class="sortable" data-sort="symbol">Symbol</th>
                                <th class="sortable text-right" data-sort="ltp">LTP (NPR)</th>
                                <th class="sortable text-right" data-sort="diff_percent">Change (%)</th>
                                <th class="sortable text-right" data-sort="open">Open</th>
                                <th class="sortable text-right" data-sort="high">High</th>
                                <th class="sortable text-right" data-sort="low">Low</th>
                                <th class="sortable text-right" data-sort="volume">Volume</th>
                                <th class="sortable text-right" data-sort="turnover">Turnover</th>
                                <th class="text-center">52W Range</th>
                                <th class="text-center">Watchlist</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${paginated.length === 0 ? `
                                <tr>
                                    <td colspan="10" class="text-center py-4 text-muted">
                                        No scrips found matching query "${state.searchQuery}".
                                    </td>
                                </tr>
                            ` : paginated.map(s => {
                                const trendClass = getTrendClass(s.diff_percent);
                                const isWatchlisted = (state.customWatchlist || []).includes(s.symbol);
                                const pos52 = Number(s.position52w || 50).toFixed(0);

                                return `
                                    <tr class="clickable-row" data-symbol="${s.symbol}">
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <strong class="symbol-badge">${s.symbol}</strong>
                                                <small class="text-muted d-none d-md-inline">${s.sector || ''}</small>
                                            </div>
                                        </td>
                                        <td class="text-right font-weight-bold">${formatNPR(s.ltp)}</td>
                                        <td class="text-right font-mono ${trendClass}">${formatPercent(s.diff_percent)}</td>
                                        <td class="text-right">${formatNPR(s.open)}</td>
                                        <td class="text-right text-emerald">${formatNPR(s.high)}</td>
                                        <td class="text-right text-crimson">${formatNPR(s.low)}</td>
                                        <td class="text-right font-mono">${formatNumber(s.volume)}</td>
                                        <td class="text-right font-mono">${formatNPR(s.turnover)}</td>
                                        <td class="text-center" style="width: 140px;">
                                            <div class="range-meter" title="52W Low: ${s.fifty_two_week_low || 'N/A'} | High: ${s.fifty_two_week_high || 'N/A'}">
                                                <div class="range-fill bg-emerald" style="width: ${pos52}%;"></div>
                                            </div>
                                        </td>
                                        <td class="text-center">
                                            <button class="btn btn-icon btn-sm toggle-watchlist-btn ${isWatchlisted ? 'active' : ''}" data-symbol="${s.symbol}" title="Add/Remove Watchlist">
                                                ${isWatchlisted ? '★' : '☆'}
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Pagination Bar -->
            <div class="card-footer d-flex justify-content-between align-items-center">
                <span class="text-muted">Page ${page} of ${totalPages}</span>
                <div class="pagination-buttons">
                    <button id="prevPageBtn" class="btn btn-sm btn-outline" ${page <= 1 ? "disabled" : ""}>Previous</button>
                    <button id="nextPageBtn" class="btn btn-sm btn-outline" ${page >= totalPages ? "disabled" : ""}>Next</button>
                </div>
            </div>
        </div>
    `;

    // Event listeners
    const searchInput = container.querySelector("#stocksSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            state.searchQuery = e.target.value;
            state.currentPage = 1;
            renderStocksView();
        });
    }

    const sectorSelect = container.querySelector("#stocksSectorSelect");
    if (sectorSelect) {
        sectorSelect.addEventListener("change", (e) => {
            state.selectedSector = e.target.value;
            state.currentPage = 1;
            renderStocksView();
        });
    }

    container.querySelectorAll(".sortable").forEach(th => {
        th.addEventListener("click", () => {
            const col = th.getAttribute("data-sort");
            if (state.sortColumn === col) {
                state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
            } else {
                state.sortColumn = col;
                state.sortDirection = "asc";
            }
            renderStocksView();
        });
    });

    const prevBtn = container.querySelector("#prevPageBtn");
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                renderStocksView();
            }
        });
    }

    const nextBtn = container.querySelector("#nextPageBtn");
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (state.currentPage < totalPages) {
                state.currentPage++;
                renderStocksView();
            }
        });
    }

    // Row click listeners for detail modal
    container.querySelectorAll(".clickable-row").forEach(row => {
        row.addEventListener("click", (e) => {
            if (e.target.classList.contains("toggle-watchlist-btn")) return;
            const sym = row.getAttribute("data-symbol");
            if (sym && window.openStockDetailModal) {
                window.openStockDetailModal(sym);
            }
        });
    });

    // Watchlist toggle buttons
    container.querySelectorAll(".toggle-watchlist-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const sym = btn.getAttribute("data-symbol");
            if (sym && window.toggleWatchlistSymbol) {
                window.toggleWatchlistSymbol(sym);
                renderStocksView();
            }
        });
    });
}
