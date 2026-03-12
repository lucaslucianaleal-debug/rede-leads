const fs = require('fs');
const s = fs.readFileSync('../whatsapp-server/index.js','utf8');
const counts = { '{':0,'}':0,'(':0,')':0,'[':0,']':0,'`':0,'"':0,"'":0 };
for (let i=0;i<s.length;i++){ const c = s[i]; if (counts[c]!==undefined) counts[c]++; }
console.log(counts);
// show last 200 chars
console.log('\n--- tail ---\n'+s.slice(-400));
