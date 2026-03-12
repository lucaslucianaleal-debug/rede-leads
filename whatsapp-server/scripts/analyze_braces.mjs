import { readFile } from 'fs/promises';
const s = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const lines = s.split(/\r?\n/);
let depth = 0;
let maxDepth = 0;
let maxPos = { line: 0, col: 0 };
for (let i=0;i<lines.length;i++){
  const line = lines[i];
  for (let j=0;j<line.length;j++){
    const ch = line[j];
    if (ch === '{') { depth++; if (depth>maxDepth){ maxDepth=depth; maxPos={line:i+1,col:j+1}; } }
    else if (ch === '}') { depth--; }
  }
}
console.log('final depth:', depth);
console.log('maxDepth:', maxDepth, 'at', maxPos);
console.log('\n--- context around maxDepth ---\n');
const start = Math.max(0, maxPos.line-5);
const end = Math.min(lines.length, maxPos.line+5);
for (let k=start;k<end;k++) console.log((k+1).toString().padStart(4,' '), lines[k]);
