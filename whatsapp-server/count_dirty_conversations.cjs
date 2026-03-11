const admin = require('firebase-admin');
const svc = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

(async ()=>{
  try{
    const crmSnap = await db.collection('crm_data').doc('shared').get();
    const leads = crmSnap.exists ? (crmSnap.data().leads || []) : [];
    const leadSet = new Set();
    const lead10Set = new Set();
    for(const l of leads){
      const ld = onlyDigits(l.telefone || '');
      if(ld) leadSet.add(ld);
      if(ld.length >= 10) lead10Set.add(ld.slice(-10));
    }

    const convs = await db.collection('conversations').get();
    let total = convs.size;
    let dirty = 0;
    const dirtyList = [];
    for(const c of convs.docs){
      const data = c.data() || {};
      const telField = onlyDigits(String(data.telefone || c.id || ''));
      const idDigits = onlyDigits(c.id || '');
      const last10 = telField.length>=10 ? telField.slice(-10) : (idDigits.length>=10? idDigits.slice(-10): telField);
      const matchesLead = leadSet.has(telField) || lead10Set.has(last10);
      if(!matchesLead){
        dirty++;
        dirtyList.push({ id: c.id, telefone: data.telefone || null });
      }
    }
    console.log(`total_conversations: ${total}`);
    console.log(`dirty_conversations (no lead match): ${dirty}`);
    console.log('sample dirty items (up to 50):');
    console.log(dirtyList.slice(0,50));
    process.exit(0);
  }catch(e){
    console.error('error', e);
    process.exit(2);
  }
})();
