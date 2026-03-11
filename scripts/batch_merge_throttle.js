/**
 * Batch merge conversations with throttling/backoff to avoid Firestore quota exhaustion.
 * Usage:
 *   node scripts/batch_merge_throttle.js merges.json [--delayMs=500] [--apply]
 * merges.json should be an array of objects: [{ "source": "12345", "target": "(17) 9xxxx" }, ...]
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function onlyDigits(s) { return String(s||'').replace(/\D/g, ''); }
function toLast11(phone) { const d = onlyDigits(phone); return d.length>=11?d.slice(-10):d; }
function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function mergeOne(db, sourceId, targetPhone, apply){
  const targetId = toLast11(targetPhone);
  if(!targetId) {
    console.error('Could not derive target id from', targetPhone);
    return {ok:false};
  }

  const sourceRef = db.collection('conversations').doc(sourceId);
  const targetRef = db.collection('conversations').doc(targetId);

  const [sourceSnap, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()]);
  if(!sourceSnap.exists){ console.warn('Source missing:', sourceId); return {ok:false}; }

  const sourceData = sourceSnap.data()||{};
  const targetData = targetSnap.exists? (targetSnap.data()||{}) : {};

  const srcMsgsSnap = await sourceRef.collection('messages').get();
  const tgtMsgsSnap = await targetRef.collection('messages').get();
  const tgtMsgIds = new Set(tgtMsgsSnap.docs.map(d=>d.id));
  let copied = 0;

  if(apply){
    for(const d of srcMsgsSnap.docs){
      if(tgtMsgIds.has(d.id)) continue;
      try{ await targetRef.collection('messages').doc(d.id).set(d.data()); copied++; }catch(e){ console.error('copy failed', d.id, e.message||e); }
    }

    const updates = {};
    if(!targetData.leadId && sourceData.leadId) updates.leadId = sourceData.leadId;
    if(!targetData.leadNome && sourceData.leadNome) updates.leadNome = sourceData.leadNome;
    if(!targetData.telefone && sourceData.telefone) updates.telefone = sourceData.telefone;
    if(Object.keys(updates).length) await targetRef.set(updates, { merge: true });

    try{ await sourceRef.delete(); }catch(e){ console.error('delete source failed', sourceId, e.message||e); }
  }

  return {ok:true, copied, sourceId, targetId};
}

async function main(){
  const argv = process.argv.slice(2);
  if(argv.length < 1){ console.error('Usage: node scripts/batch_merge_throttle.js merges.json [--delayMs=500] [--apply]'); process.exit(1); }
  const mergesFile = argv[0];
  const delayArg = argv.find(a=>a.startsWith('--delayMs='));
  const delayMs = delayArg ? Number(delayArg.split('=')[1]) : 500;
  const apply = argv.includes('--apply');

  let merges;
  try{ merges = JSON.parse(fs.readFileSync(path.resolve(mergesFile), 'utf8')); }catch(e){ console.error('Failed to read merges file:', e.message||e); process.exit(1); }

  if(!Array.isArray(merges)){ console.error('merges.json must be an array'); process.exit(1); }

  try{ admin.initializeApp({ credential: admin.credential.applicationDefault() }); }catch(e){ console.error('Failed to init firebase-admin. Set GOOGLE_APPLICATION_CREDENTIALS or use serviceAccountKey.'); process.exit(1); }
  const db = admin.firestore();

  console.log(`Starting batch merge: items=${merges.length} delayMs=${delayMs} apply=${apply}`);
  let summary = { processed:0, succeeded:0, totalCopied:0 };

  for(const item of merges){
    summary.processed++;
    const src = item.source; const tgt = item.target;
    console.log(`Processing ${summary.processed}/${merges.length}: ${src} -> ${tgt}`);
    try{
      const res = await mergeOne(db, String(src), String(tgt), apply);
      if(res.ok){ summary.succeeded++; summary.totalCopied += (res.copied||0); console.log(`  OK copied=${res.copied||0}`); }
      else console.log('  Skipped or failed for', src);
    }catch(e){ console.error('  Error merging', src, e.message||e); }

    if(summary.processed < merges.length) await delay(delayMs);
  }

  console.log('Batch done:', summary);
  try{ await admin.app().delete(); }catch{};
}

main().catch(e=>{ console.error('Fatal:', e); process.exit(1); });
