const fs = require('fs');

let oldHtml = fs.readFileSync('index.html', 'utf8');
let bakHtml = fs.readFileSync('index.html.npstocks.bak', 'utf8');

// 1. Extract views from bakHtml
const getDiv = (id) => {
    const start = bakHtml.indexOf(`<div id="${id}"`);
    if (start === -1) return "";
    let end = bakHtml.indexOf('<div id=', start + 10);
    if (end === -1 || (id === 'floorsheetView' && end !== -1)) {
        // floorsheet is the last one before </main>
        end = bakHtml.indexOf('</main>', start);
    }
    let content = bakHtml.substring(start, end).trim();
    // Add "hidden" class to ensure they don't show at the same time
    if (!content.includes('class="view-section hidden"')) {
        content = content.replace('class="view-section"', 'class="view-section hidden"');
    }
    return content;
};

const bubble = getDiv('bubbleView');
const chart = getDiv('chartView');
const portfolio = getDiv('portfolioView');
const floorsheet = getDiv('floorsheetView');

const modalsStart = bakHtml.indexOf('<!-- Modals -->');
const modalsEnd = bakHtml.indexOf('<script', modalsStart);
const modals = bakHtml.substring(modalsStart, modalsEnd).trim();

// 2. Append to oldHtml inside main.main-content
const mainEnd = oldHtml.indexOf('</div>\n    </div>'); // the end of app-container
const injection = `
        <!-- Injected Views -->
        ${floorsheet}
        ${bubble}
        ${chart}
        ${portfolio}
`;
oldHtml = oldHtml.replace('</div>\n    </div>', injection + '\n    </div>\n    </div>\n\n    ' + modals);

// 3. Update sidebar nav
const navLinks = `
                <a href="#" class="nav-item active" data-view="dashboard">
                    <span class="nav-icon">📊</span> Market Today
                </a>
                <a href="#" class="nav-item" data-view="floorsheet">
                    <span class="nav-icon">🔍</span> Floorsheet
                </a>
                <a href="#" class="nav-item" data-view="bubble">
                    <span class="nav-icon">🔵</span> Bubble Map
                </a>
                <a href="#" class="nav-item" data-view="chart">
                    <span class="nav-icon">📈</span> Tech Chart
                </a>
                <a href="#" class="nav-item" data-view="portfolio">
                    <span class="nav-icon">📓</span> Trade Journal
                </a>
`;
oldHtml = oldHtml.replace(/<a href="#" class="nav-item active">[\s\S]*?<\/a>/, navLinks);

// 4. Update script tags
if (!oldHtml.includes('d3.v7.min.js')) {
    oldHtml = oldHtml.replace('<script src="app.js"></script>', '<script src="https://d3js.org/d3.v7.min.js"></script>\n    <script src="https://s3.tradingview.com/tv.js"></script>\n    <script src="app.js"></script>');
}

fs.writeFileSync('index.html', oldHtml);
console.log("Successfully rebuilt index.html");
