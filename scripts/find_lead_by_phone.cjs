const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function normalize(raw){
  if(!raw) return '';
  return String(raw).replace(/\D/g,'');
}

async function find(phone){
  const norm = normalize(phone);
  const variants = new Set([norm]);
  if(!norm.startsWith('55')) variants.add('55'+norm);
  if(norm.length===11 && norm.startsWith('0')===false){
    // also try without leading 1/0? keep as is
  }
  console.log('Searching for', [...variants].join(', '));

  // search crm_data/shared
  const crmRef = db.collection('crm_data').doc('shared');
  const crmSnap = await crmRef.get();
  const crmLeads = Array.isArray(crmSnap.data()?.leads) ? crmSnap.data().leads : [];
  const crmMatches = crmLeads.filter(l=>{
    const tel = normalize(l.telefone||l.telefone_norm||'');
    return [...variants].some(v=>tel.includes(v) || v.includes(tel));
  });
  console.log(`crm_data/shared -> matches=${crmMatches.length}`);
  crmMatches.slice(0,20).forEach((l,i)=>console.log(`  ${i+1}. ${l.nome||'(no-name)'} ${l.telefone||''} etapa=${l.etapaLead||''}`));

  // search clinics
  const clinics = await db.collection('clinics').get();
  for(const c of clinics.docs){
    const cid = c.id;
    const ref = db.collection('clinics').doc(cid).collection('shared').doc('shared');
    const snap = await ref.get();
    const leads = Array.isArray(snap.data()?.leads) ? snap.data().leads : [];
    const matches = leads.filter(l=>{
      const tel = normalize(l.telefone||l.telefone_norm||'');
      return [...variants].some(v=>tel.includes(v) || v.includes(tel));
    });
    if(matches.length>0){
      console.log(`clinics/${cid}/shared/shared -> matches=${matches.length}`);
      matches.slice(0,20).forEach((l,i)=>console.log(`  ${i+1}. ${l.nome||'(no-name)'} ${l.telefone||''} etapa=${l.etapaLead||''}`));
    }
  }

  // search leads collection (limit 1000)
  const leadSnap = await db.collection('leads').limit(1000).get();
  const leadMatches = [];
  leadSnap.forEach(doc=>{
    const d = doc.data();
    const tel = normalize(d.telefone||d.telefone_norm||'');
    if([...variants].some(v=>tel.includes(v) || v.includes(tel))){
      leadMatches.push({id: doc.id, nome: d.nome, telefone: d.telefone});
    }
  });
  console.log(`leads collection scanned=${leadSnap.size} -> matches=${leadMatches.length}`);
  leadMatches.slice(0,50).forEach((m,i)=>console.log(`  ${i+1}. id=${m.id} nome=${m.nome||''} telefone=${m.telefone||''}`));
}

const phone = process.argv[2] || '19997721583';
find(phone).then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1)});
