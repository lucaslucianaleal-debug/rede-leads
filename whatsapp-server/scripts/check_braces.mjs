import { readFile } from 'fs/promises';
const s = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const counts = { '{':0,'}':0,'(':0,')':0,'[':0,']':0,'`':0,'"':0,"'":0 };
for (let i=0;i<s.length;i++){ const c = s[i]; if (counts[c]!==undefined) counts[c]++; }
console.log(counts);
console.log('\n--- tail ---\n'+s.slice(-400));
