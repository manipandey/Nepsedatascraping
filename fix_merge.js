const fs = require('fs');

let bakHtml = fs.readFileSync('index.html.npstocks.bak', 'utf8');
let oldHtml = fs.readFileSync('index.html', 'utf8');

const getDivContent = (id) => {
    const startIdx = bakHtml.indexOf(`<div id="${id}"`);
    if (startIdx === -1) return "";
    // Find the next view-section
    const endIdx = bakHtml.indexOf('<div id="', startIdx + 10);
    if (endIdx === -1) {
        return bakHtml.substring(startIdx, bakHtml.indexOf('</main>'));
    }
    return bakHtml.substring(startIdx, endIdx);
};

const bubbleStr = getDivContent("bubbleView");
const chartStr = getDivContent("chartView");
const portfolioStr = getDivContent("portfolioView");

let injected = "";
if (bubbleStr) injected += bubbleStr + "\n";
if (chartStr) injected += chartStr + "\n";
if (portfolioStr) injected += portfolioStr + "\n";

// Wrap in light theme if needed, but for now just inject as is (bubble and chart are transparent mostly, portfolio is cards)
// Actually just injecting them directly into <main> is fine because we want dark mode anyway.
oldHtml = oldHtml.replace('</main>', injected + '\n</main>');

fs.writeFileSync('index.html', oldHtml);
console.log("Injected views:", !!bubbleStr, !!chartStr, !!portfolioStr);
