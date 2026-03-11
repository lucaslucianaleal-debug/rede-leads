#!/usr/bin/env node
const admin = require('firebase-admin');
const { execFileSync } = require('child_process');
const path = require('path');

const svcPath = path.join(__dirname, '..', 'whatsapp-server', 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(svcPath)) });
const db = admin.firestore();

async function main() {
  console.log('[merge-all] scanning conversations collection...');
  const snap = await db.collection('conversations').get();
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));

  const orphans = [];
  for (const doc of docs) {
    const id = doc.id;
    const last11 = id.replace(/[^0-9]/g, '').slice(-10);
    if (!last11) continue;
    if (id === last11) continue; // already canonical
    // check if canonical exists
    const canonRef = db.collection('conversations').doc(last11);
    const canonSnap = await canonRef.get();
    if (canonSnap.exists) {
      orphans.push({ source: id, target: last11 });
    }
  }

  if (!orphans.length) {
    console.log('[merge-all] no orphans found to merge.');
    process.exit(0);
  }

  console.log(`[merge-all] found ${orphans.length} orphan(s) — applying merges sequentially`);
  for (const pair of orphans) {
    console.log(`[merge-all] merging ${pair.source} -> ${pair.target}`);
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'merge_conversations.js'), pair.source, pair.target, '--apply'], { stdio: 'inherit', cwd: process.cwd() });
    } catch (err) {
      console.error(`[merge-all] merge failed for ${pair.source} -> ${pair.target}:`, err.message);
    }
  }

  console.log('[merge-all] done.');
}

main().catch(err => { console.error(err); process.exit(2); });
