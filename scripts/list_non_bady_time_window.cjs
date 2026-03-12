const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const { parse, format } = require('date-fns');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function parseTimeFromText(text, dateStr) {
  if (!text) return null;
  const dtPattern = new RegExp(`(\\d{2}\\/\\d{2}\\/\\d{4})\\s*(\\d{2}:\\d{2})`);
  const m = text.match(dtPattern);
  if (m) {
    try { return parse(`${m[1]} ${m[2]}`, 'dd/MM/yyyy HH:mm', new Date()); } catch (e) {}
  }
  const tPattern = /(\\d{2}:\\d{2})/;
  const mt = text.match(tPattern);
  if (mt && dateStr) {
    try { return parse(`${dateStr} ${mt[1]}`, 'dd/MM/yyyy HH:mm', new Date()); } catch (e) {}
  }
  return null;
}

function timestampFromLeadId(leadId) {
  if (!leadId) return null;
  const m = String(leadId).match(/lead_(\d{10,})/);
  if (m) { const ms = Number(m[1]); if (!isNaN(ms) && ms > 1000000000000) return new Date(ms); }
  return null;
}

async function inspect(dateStr, startTime, endTime) {
  const start = parse(`${dateStr} ${startTime}`, 'dd/MM/yyyy HH:mm', new Date());
  const end = parse(`${dateStr} ${endTime}`, 'dd/MM/yyyy HH:mm', new Date());
  console.log(`Searching leads between ${start.toISOString()} and ${end.toISOString()}, excluding Bady Bassit`);

  const results = [];
  function checkAndPush(lead, source) {
    if (String(source).includes('badybassit')) return; // exclude
    let ts = null;
    ts = parseTimeFromText(lead.observacao || '', dateStr) || parseTimeFromText(lead.dataAgendamento || '', dateStr) || parseTimeFromText(lead.dataRetornoLigacao || '', dateStr) || ts;
    if (!ts && lead.id) ts = timestampFromLeadId(lead.id);
    if (!ts) {
      const maybe = (lead.dataContato || lead.dataCriacao || '');
      const parts = maybe.split(' ');
      if (parts.length >= 2) { const d = parseTimeFromText(maybe, dateStr); if (d) ts = d; }
    }
    if (!ts) return;
    if (ts >= start && ts <= end) results.push({ lead, source, ts: ts.toISOString() });
  }

  try {
    const crmSnap = await db.collection('crm_data').doc('shared').get();
    const leads = Array.isArray(crmSnap.data()?.leads) ? crmSnap.data().leads : [];
    leads.forEach(l => checkAndPush(l, 'crm_data/shared'));
  } catch (e) { console.error('crm_data read error', e); }

  try {
    const clinics = await db.collection('clinics').get();
    for (const c of clinics.docs) {
      const cid = c.id;
      try {
        const snap = await db.collection('clinics').doc(cid).collection('shared').doc('shared').get();
        const leads = Array.isArray(snap.data()?.leads) ? snap.data().leads : [];
        leads.forEach(l => checkAndPush(l, `clinics/${cid}/shared/shared`));
      } catch (e) {}
    }
  } catch (e) { console.error('clinics read error', e); }

  try {
    const snap = await db.collection('leads').limit(2000).get();
    snap.forEach(doc => { const l = doc.data(); l._docId = doc.id; checkAndPush(l, `leads/${doc.id}`); });
  } catch (e) { console.error('leads read error', e); }

  results.sort((a,b)=> new Date(a.ts) - new Date(b.ts));
  console.log(`Found ${results.length} leads (excluding Bady Bassit):`);
  results.forEach((r,i)=>{
    const l = r.lead;
    console.log(`${i+1}. source=${r.source} ts=${r.ts}`);
    console.log(`   nome=${l.nome || ''} telefone=${l.telefone || l.telefone_norm || ''} id=${l.id || l._docId || ''} etapa=${l.etapaLead || ''}`);
  });
}

const dateStr = process.argv[2] || format(new Date(), 'dd/MM/yyyy');
const startTime = process.argv[3] || '14:30';
const endTime = process.argv[4] || '15:02';
inspect(dateStr, startTime, endTime).then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1)});
