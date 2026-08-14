const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace standard exact bindings
code = code.replace(/elements\.([a-zA-Z0-9_]+)\.addEventListener\(/g, "if (elements.$1) elements.$1.addEventListener(");

// Fix the renderTopList function to output nested-item divs
const renderTopListTarget = `function renderTopList(data, targetId) {`;
const renderTopListNew = `function renderTopList(data, targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = "";
    data.forEach(stock => {
        const sign = stock.diff >= 0 ? "+" : "";
        const colorClass = stock.diff >= 0 ? "text-success" : "text-danger";
        const badgeClass = stock.diff >= 0 ? "badge-success" : "badge-danger";
        const html = \`
            <div class="nested-item">
                <div>
                    <div style="font-weight: 700; font-size: 1.05rem;">\${stock.symbol}</div>
                    <div class="text-muted" style="font-size: 0.85rem;">Rs \${formatters.decimal(stock.close)}</div>
                </div>
                <div class="badge \${badgeClass}" style="font-size: 0.85rem;">
                    \${sign}\${formatters.decimal(stock.diffPercent)}%
                </div>
            </div>\`;
        target.insertAdjacentHTML('beforeend', html);
    });
}
`;
code = code.replace(/function renderTopList\([^)]+\)\s*\{[\s\S]*?(?=\nfunction)/, renderTopListNew);

// Add nav-item click handlers
code += `
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        e.target.classList.add('active');
        const view = e.target.getAttribute('data-view');
        
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
        const targetSec = document.getElementById(view + 'View');
        if (targetSec) targetSec.classList.remove('hidden');
    });
});
`;

fs.writeFileSync('app.js', code);
console.log("Fixed app.js listeners and rendering.");
