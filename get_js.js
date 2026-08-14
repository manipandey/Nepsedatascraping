const fs = require('fs');
let bakJs = fs.readFileSync('app.js.npstocks.bak', 'utf8');
let match = bakJs.match(/async function fetchFloorsheetData[\s\S]*/);
if (match) {
    let oldJs = fs.readFileSync('app.js', 'utf8');
    oldJs = oldJs + "\n\n// --- FLOORSHEET LOGIC ---\n" + match[0] + "\n\nif (elements.btnFetchFloorsheet) { elements.btnFetchFloorsheet.addEventListener('click', fetchFloorsheetData); }\n";
    fs.writeFileSync('app.js', oldJs);
    console.log("Appended floorsheet logic to app.js");
} else {
    console.log("Still failed to find fetchFloorsheetData");
}
