import { readFile } from 'fs/promises';
const s = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const lines = s.split(/\r?\n/);
let depth = 0;
const events = [];
for (let i=0;i<lines.length;i++){
  const line = lines[i];
  for (let j=0;j<line.length;j++){
    const ch = line[j];
    if (ch === '{') { depth++; events.push({type:'open', line:i+1, col:j+1, depth}); }
    else if (ch === '}') { events.push({type:'close', line:i+1, col:j+1, depth}); depth--; }
  }
}
console.log('final depth:', depth);
const unclosed = events.filter(e => e.type==='open' && e.depth> (events.filter(x=>x.line<=e.line).length) );
// print last 20 events and show where depth last positive
const lastEvents = events.slice(-80);
for (const ev of lastEvents) console.log(ev.type.padEnd(6), 'line', String(ev.line).padStart(4), 'col', String(ev.col).padStart(3), 'depth', ev.depth);
// find last open event that wasn't matched
let stack = [];
for (const ev of events) {
  if (ev.type==='open') stack.push(ev);
  else if (ev.type==='close') stack.pop();
}
if (stack.length) {
  console.log('\nUnmatched opens (top of stack):');
  console.log(stack.slice(-5));
  const top = stack[stack.length-1];
  const contextStart = Math.max(0, top.line-6);
  const contextEnd = Math.min(lines.length, top.line+6);
  console.log('\nContext around last unmatched open (line '+top.line+'):\n');
  for (let k=contextStart;k<contextEnd;k++) console.log((k+1).toString().padStart(4,' '), lines[k]);
} else {
  console.log('No unmatched opens found.');
}
