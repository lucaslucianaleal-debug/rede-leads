const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function norm(s){ return String(s||'').replace(/\D/g,''); }

async function run(phone){
  const n = norm(phone);
  const variants = new Set([n]);
  if(!n.startsWith('55')) variants.add('55'+n);
  console.log('Searching variants:', [...variants].join(', '));

  // crm_data/shared
  const crm = await db.collection('crm_data').doc('shared').get();
  const crmLeads = Array.isArray(crm.data()?.leads)?crm.data().leads:[];
  const crmMatch = crmLeads.filter(l=>[...variants].some(v=>norm(l.telefone||l.telefone_norm||'').includes(v)||v.includes(norm(l.telefone||''))));
  console.log('crm_data/shared matches:', crmMatch.length);
  crmMatch.forEach((l,i)=>console.log(` crm[${i}]: id=${l.id} nome=${l.nome} telefone=${l.telefone}`));

  // clinics
  const clinics = await db.collection('clinics').get();
  for(const c of clinics.docs){
    const cid = c.id;
    const snap = await db.collection('clinics').doc(cid).collection('shared').doc('shared').get();
    const leads = Array.isArray(snap.data()?.leads)?snap.data().leads:[];
    const matches = leads.filter(l=>[...variants].some(v=>norm(l.telefone||l.telefone_norm||'').includes(v)||v.includes(norm(l.telefone||''))));
    if(matches.length>0){
      console.log(`clinics/${cid}/shared/shared matches=${matches.length}`);
      matches.forEach((l,i)=>console.log(` clinic ${cid} [${i}]: id=${l.id} nome=${l.nome} telefone=${l.telefone}`));
    }
  }

  // leads collection scan (limit 2000)
  const snap = await db.collection('leads').limit(2000).get();
  const matches = [];
  snap.forEach(doc=>{
    const d = doc.data();
    if([...variants].some(v=>norm(d.telefone||d.telefone_norm||'').includes(v)||v.includes(norm(d.telefone||'')))){
      matches.push({ id: doc.id, data: d });
    }
  });
  console.log('leads collection matches:', matches.length);
  matches.forEach((m,i)=>{
    console.log(` lead doc ${i}: id=${m.id}`);
    console.log(JSON.stringify(m.data, null, 2));
  });
}

const phone = process.argv[2] || '16997922633';
run(phone).then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1)});
