const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace autoRefreshBadge.style
code = code.replace(/elements\.autoRefreshBadge\.style/g, "(elements.autoRefreshBadge ? elements.autoRefreshBadge.style : {})");

// Replace autoRefreshText.textContent
code = code.replace(/elements\.autoRefreshText\.textContent/g, "if (elements.autoRefreshText) elements.autoRefreshText.textContent");

fs.writeFileSync('app.js', code);
console.log("Fixed autoRefresh bugs.");
