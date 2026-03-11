import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

async function main(){
  const args = process.argv.slice(2);
  if(args.length < 1){
    console.error('Usage: node merge_leads_for_phone.js <phone-fragment>');
    process.exit(1);
  }
  const fragment = onlyDigits(args[0]);
  try{
    const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }catch(e){
    try{ admin.initializeApp(); }catch(err){ console.error('firebase init failed',err); process.exit(1); }
  }
  const db = admin.firestore();

  const crmRef = db.collection('crm_data').doc('shared');
  const snap = await crmRef.get();
  if(!snap.exists){ console.error('crm_data/shared not found'); process.exit(1); }
  const leads = snap.data().leads || [];

  // find leads matching fragment in phone
  const matches = leads.filter(l => onlyDigits(l.telefone||'').includes(fragment) || onlyDigits(String(l.telefone||'')).endsWith(fragment.slice(-8)) );
  console.log('Found leads:', matches.length);
  matches.forEach(m=>console.log(m.id, m.nome, m.telefone));

  if(matches.length <= 1){ console.log('Nothing to merge'); process.exit(0); }

  // choose primary: prefer one whose nome is not like 'WhatsApp NNNN' and not empty
  let primary = matches.find(m => m.nome && !/^WhatsApp \d+$/i.test(String(m.nome).trim()));
  if(!primary) primary = matches[0];

  console.log('Primary lead chosen:', primary.id, primary.nome, primary.telefone);

  // build new leads array: remove others and keep primary, optionally merge notes
  const others = matches.filter(m=>m.id !== primary.id);
  const newLeads = leads.filter(l => !others.some(o=>o.id === l.id));

  // Update conversations referencing other leads -> point to primary
  const convs = await db.collection('conversations').get();
  for(const cdoc of convs.docs){
    const data = cdoc.data() || {};
    if(others.some(o => o.id === data.leadId)){
      await cdoc.ref.set({ leadId: primary.id, leadNome: primary.nome }, { merge: true });
      console.log(`Updated conversation ${cdoc.id} -> lead ${primary.id}`);
    }
    // also if telefone matches others variants, set telefone to primary last10
    const tel = onlyDigits(data.telefone||'');
    if(tel && matches.some(m => onlyDigits(m.telefone || '').slice(-10) === tel.slice(-10))){
      const primaryTel = onlyDigits(primary.telefone||'').slice(-10) || onlyDigits(primary.telefone||'');
      if(primaryTel) await cdoc.ref.set({ telefone: primaryTel, leadId: primary.id, leadNome: primary.nome }, { merge: true });
    }
  }

  // write updated leads array
  await crmRef.update({ leads: newLeads });
  console.log('Leads array updated: removed', others.length, 'leads');

  // done
  await admin.app().delete();
  console.log('Done. Primary lead is:', primary.id);
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
