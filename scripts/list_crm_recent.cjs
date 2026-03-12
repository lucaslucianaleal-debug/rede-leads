const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const { format } = require('date-fns');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function listRecent() {
  const today = format(new Date(), 'dd/MM/yyyy');
  console.log('Today:', today);
  const ref = db.collection('crm_data').doc('shared');
  const snap = await ref.get();
  if (!snap.exists) { console.log('crm_data/shared not found'); return; }
  const data = snap.data();
  const leads = Array.isArray(data.leads) ? data.leads : [];
  const recent = leads.filter(l => (l.dataCriacao || '').startsWith(today));
  console.log(`crm_data/shared -> total=${leads.length}, created today=${recent.length}`);
  recent.slice(0, 50).forEach((l, i) => {
    console.log(`${i+1}. id=${l.id} nome=${l.nome || '(no-name)'} telefone=${l.telefone || ''} etapa=${l.etapaLead || ''}`);
  });
}

listRecent().then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1)});
