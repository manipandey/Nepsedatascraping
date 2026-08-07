const fs = require('fs');

// 1. Restore HTML
let oldHtml = fs.readFileSync('index.html', 'utf8');
let bakHtml = fs.readFileSync('index.html.npstocks.bak', 'utf8');

// Extract nav button
const navBtnMatch = bakHtml.match(/<button class="nav-item" data-view="floorsheet">Floorsheet<\/button>/);
// We will add it to the sidebar in oldHtml
const sidebarMarker = `<ul class="sidebar-links">`;
oldHtml = oldHtml.replace(sidebarMarker, `${sidebarMarker}\n                <li data-view="floorsheet" id="navFloorsheet"><svg viewBox="0 0 24 24"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Floorsheet Analysis</li>`);

// Extract floorsheet view
const floorsheetMatch = bakHtml.match(/<!-- FLOORSHEET VIEW -->[\s\S]*?(?=<\/main>)/);
if (floorsheetMatch) {
    // Wrap it in a div that explicitly forces a light theme background so it looks like NPStocks
    const injectedHtml = `<div id="floorsheetView" class="view-section" style="display: none; background: #F4F5F7; padding: 20px; border-radius: 12px; color: #111827;">\n` + floorsheetMatch[0] + `\n</div>`;
    oldHtml = oldHtml.replace(/<!-- PORTFOLIO VIEW -->[\s\S]*?<\/div>(\s*)<\/div>/, match => match + '\n\n' + injectedHtml);
}
fs.writeFileSync('index.html', oldHtml);


// 2. Restore CSS
let oldCss = fs.readFileSync('style.css', 'utf8');
let bakCss = fs.readFileSync('style.css.npstocks.bak', 'utf8');

// Extract specific floorsheet CSS from bakCss (we'll just append the NPStocks specific rules, scoped to #floorsheetView)
const appendCss = `
/* --- NPStocks Floorsheet UI Scoped Styles --- */
#floorsheetView {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
#floorsheetView .card {
    background: #FFFFFF;
    border-radius: 20px;
    padding: 24px;
    border: 1px solid rgba(0,0,0,0.03);
    margin-bottom: 24px;
}
#floorsheetView .analysis-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
}
#floorsheetView table { width: 100%; border-collapse: collapse; }
#floorsheetView th { text-align: left; padding: 12px 16px; color: #6B7280; font-size: 0.85rem; border-bottom: 2px solid #F3F4F6; text-transform: uppercase; }
#floorsheetView td { padding: 16px; font-size: 0.95rem; border-bottom: 1px solid #F3F4F6; font-weight: 500; }
#floorsheetView .search-bar { display: flex; gap: 10px; }
#floorsheetView .search-input { flex: 1; padding: 12px 20px; border: 1px solid #E5E7EB; border-radius: 32px; font-size: 1rem; outline: none; background: white; color: #111827; }
#floorsheetView .btn { padding: 12px 24px; border-radius: 32px; border: none; background: #111827; color: white; font-weight: 600; cursor: pointer; }
#floorsheetView .btn-primary { background: #6366F1; }
#floorsheetView .section-title { font-size: 1.25rem; font-weight: 800; margin-bottom: 16px; letter-spacing: -0.02em; }
#floorsheetView .vwap-badge { background: rgba(56, 189, 248, 0.1); color: #6366F1; padding: 8px 16px; border-radius: 32px; font-weight: 700; }
`;
fs.writeFileSync('style.css', oldCss + appendCss);


// 3. Restore JS logic
let oldJs = fs.readFileSync('app.js', 'utf8');
let bakJs = fs.readFileSync('app.js.npstocks.bak', 'utf8');

// A. Inject elements into cache
const jsCacheMarker = `    // Portfolio & Watchlist elements`;
const elementsToInject = `    // Floorsheet Elements
    navFloorsheet: document.getElementById("navFloorsheet"),
    floorsheetView: document.getElementById("floorsheetView"),
    fsSymbol: document.getElementById("fsSymbol"),
    fsBuyer: document.getElementById("fsBuyer"),
    fsSeller: document.getElementById("fsSeller"),
    btnFetchFloorsheet: document.getElementById("btnFetchFloorsheet"),
    floorsheetTableBody: document.getElementById("floorsheetTableBody"),
    fsAnalysisGrid: document.getElementById("fsAnalysisGrid"),
    fsTopBuyersBody: document.getElementById("fsTopBuyersBody"),
    fsTopSellersBody: document.getElementById("fsTopSellersBody"),
    fsNetAccumulationBody: document.getElementById("fsNetAccumulationBody"),
    fsVwapBadge: document.getElementById("fsVwapBadge"),
    fsVwapValue: document.getElementById("fsVwapValue"),
`;
oldJs = oldJs.replace(jsCacheMarker, elementsToInject + jsCacheMarker);

// B. Inject view switching
const switchViewMarker = `        elements.portfolioView.style.display = view === "portfolio" ? "block" : "none";`;
oldJs = oldJs.replace(switchViewMarker, switchViewMarker + `\n        if (elements.floorsheetView) elements.floorsheetView.style.display = view === "floorsheet" ? "block" : "none";`);

const navActiveMarker = `    if (elements.navPortfolio) elements.navPortfolio.classList.toggle("active", view === "portfolio");`;
oldJs = oldJs.replace(navActiveMarker, navActiveMarker + `\n    if (elements.navFloorsheet) elements.navFloorsheet.classList.toggle("active", view === "floorsheet");`);

const navListenerMarker = `    if (elements.navPortfolio) {
        elements.navPortfolio.addEventListener("click", () => {
            switchView("portfolio");
        });
    }`;
oldJs = oldJs.replace(navListenerMarker, navListenerMarker + `\n    if (elements.navFloorsheet) {
        elements.navFloorsheet.addEventListener("click", () => {
            switchView("floorsheet");
        });
    }`);


// C. Inject Floorsheet Functions
// We will grab fetchFloorsheetData and analyzeFloorsheet from bakJs
let fetchFuncMatch = bakJs.match(/async function fetchFloorsheetData[\s\S]*?(?=\n\/\/ \-\-\-)/);
if (!fetchFuncMatch) {
    // Let's just find it explicitly
    fetchFuncMatch = bakJs.match(/async function fetchFloorsheetData[\s\S]*?(?=function loadChartForSymbol)/);
}

if (fetchFuncMatch) {
    oldJs = oldJs + "\n\n// --- FLOORSHEET LOGIC ---\n" + fetchFuncMatch[0] + "\n\nif (elements.btnFetchFloorsheet) { elements.btnFetchFloorsheet.addEventListener('click', fetchFloorsheetData); }\n";
} else {
    console.error("Could not find fetchFloorsheetData in backup JS!");
}

fs.writeFileSync('app.js', oldJs);
console.log("Successfully merged NPStocks floorsheet into original UI!");
