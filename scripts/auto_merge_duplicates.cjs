const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const admin = require('firebase-admin');

// inicializa firebase-admin usando serviceAccountKey.json do whatsapp-server
const sa = JSON.parse(readFileSync(__dirname + '/../whatsapp-server/serviceAccountKey.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

function last8(id) {
  const d = String(id || '').replace(/\D/g, '');
  return d.slice(-8);
}

function last11(id) {
  const d = String(id || '').replace(/\D/g, '');
  return d.slice(-11);
}

(async function main(){
  try {
    const sinceHours = 24; // default 24h
    const sinceMs = Date.now() - (sinceHours * 3600 * 1000);

    console.log(`[auto-merge] scanning conversations with lastMessageAt in last ${sinceHours}h`);

    const convsSnap = await db.collection('conversations').get();
    const groups = new Map();

    for (const doc of convsSnap.docs) {
      const data = doc.data() || {};
      const id = doc.id;
      const lastAt = data.lastMessageAt && data.lastMessageAt.toMillis ? data.lastMessageAt.toMillis() : 0;
      if (lastAt < sinceMs) continue; // only recent

      const key = last8(id);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id, doc });
    }

    const toMerge = [];
    for (const [k, arr] of groups.entries()) {
      if (arr.length <= 1) continue;
      // choose target: prefer doc with leadId, else with most messages, else first
      let target = null;
      // gather message counts
      const detailed = await Promise.all(arr.map(async (item) => {
        const msgs = await db.collection('conversations').doc(item.id).collection('messages').get();
        return { id: item.id, leadId: (item.doc.data()||{}).leadId, count: msgs.size };
      }));

      // prefer leadId
      const withLead = detailed.find(d=>d.leadId);
      if (withLead) target = withLead.id;
      else {
        detailed.sort((a,b)=>b.count - a.count);
        target = detailed[0].id;
      }

      for (const d of detailed) {
        if (d.id !== target) toMerge.push({ source: d.id, target });
      }
    }

    if (toMerge.length === 0) {
      console.log('[auto-merge] No duplicates detected in timeframe.');
      process.exit(0);
    }

    const results = [];
    for (const m of toMerge) {
      console.log(`[auto-merge] Merging ${m.source} -> ${m.target}`);
      try {
        // call existing merge script with --apply
        const rootCmd = `node "${__dirname.replace(/\\scripts$/,'').replace(/\\/g,'\\\\')}/scripts/merge_conversations.js" ${m.source} ${m.target} --apply`;
        const out = execSync(rootCmd, { encoding: 'utf8', stdio: 'pipe' });
        results.push({ source: m.source, target: m.target, ok: true, out: out.split('\n').slice(-6).join('\n') });
      } catch (e) {
        results.push({ source: m.source, target: m.target, ok: false, error: String(e.message).slice(0,400) });
      }
    }

    console.log('[auto-merge] Summary:');
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('[auto-merge] error', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
