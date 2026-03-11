import { readFileSync, writeFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function norm(d) {
  if (!d) return '';
  return String(d).replace(/\D/g, '');
}
function last10(d) {
  const n = norm(d);
  return n.slice(-10);
}

async function main() {
  const svcPath = new URL('./serviceAccountKey.json', import.meta.url);
  const svc = JSON.parse(readFileSync(svcPath));
  initializeApp({ credential: cert(svc) });
  const db = getFirestore();

  const report = { summary: {}, crmDataLeads: [], leadsCollection: [], conversations: [], comparisons: {} };

  // 1) crm_data.shared.leads (if exists)
  try {
    const crmRef = db.collection('crm_data').doc('shared');
    const crmSnap = await crmRef.get();
    const crmLeads = crmSnap.exists ? (crmSnap.data().leads || []) : [];
    report.crmDataLeads = crmLeads.map(l => ({ id: l.id || null, nome: l.nome || null, telefone_raw: l.telefone || null, telefone_norm: norm(l.telefone), last10: last10(l.telefone) }));
  } catch (e) {
    report.crmDataLeadsError = String(e);
  }

  // 2) leads collection
  try {
    const leadsSnap = await db.collection('leads').get();
    const leads = [];
    leadsSnap.forEach(d => {
      const data = d.data();
      leads.push({ id: d.id, nome: data.nome || null, telefone_raw: data.telefone_real || data.telefone || null, telefone_norm: norm(data.telefone_real || data.telefone || ''), last10: last10(data.telefone_real || data.telefone || '') });
    });
    report.leadsCollection = leads;
  } catch (e) {
    report.leadsCollectionError = String(e);
  }

  // 3) conversations collection (ids + telefone field)
  try {
    const convSnap = await db.collection('conversations').get();
    const convs = [];
    convSnap.forEach(d => {
      const data = d.data();
      const id = d.id;
      const telefone = data.telefone || id || null;
      convs.push({ id, telefone_raw: telefone, telefone_norm: norm(telefone), last10: last10(telefone) });
    });
    report.conversations = convs;
  } catch (e) {
    report.conversationsError = String(e);
  }

  // Build sets for comparison
  const crmSet = new Map();
  for (const l of report.crmDataLeads) {
    crmSet.set(l.last10, (crmSet.get(l.last10) || new Set()).add(l.telefone_norm));
  }
  const leadsSet = new Map();
  for (const l of report.leadsCollection) {
    leadsSet.set(l.last10, (leadsSet.get(l.last10) || new Set()).add(l.telefone_norm));
  }
  const convSet = new Map();
  for (const c of report.conversations) {
    convSet.set(c.last10, (convSet.get(c.last10) || new Set()).add(c.telefone_norm));
  }

  const allLast10 = new Set([...crmSet.keys(), ...leadsSet.keys(), ...convSet.keys()].filter(k => k));

  const diffs = [];
  for (const key of allLast10) {
    const crmNums = Array.from(crmSet.get(key) || []);
    const leadNums = Array.from(leadsSet.get(key) || []);
    const convNums = Array.from(convSet.get(key) || []);
    diffs.push({ last10: key, crm: crmNums, leadsCollection: leadNums, conversations: convNums });
  }

  report.comparisons = { totalLast10Groups: allLast10.size, diffs };

  // summary counts
  report.summary = {
    crmCount: report.crmDataLeads.length,
    leadsCollectionCount: report.leadsCollection.length,
    conversationsCount: report.conversations.length,
    mismatchedGroups: diffs.filter(d => {
      const unique = new Set([...(d.crm || []), ...(d.leadsCollection || []), ...(d.conversations || [])]);
      return unique.size > 1;
    }).length,
  };

  const out = JSON.stringify(report, null, 2);
  writeFileSync('./diagnose_report.json', out);
  console.log('Report written to diagnose_report.json');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(2);
});
