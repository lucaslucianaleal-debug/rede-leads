import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

async function main(){
  try{
    const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }catch(e){
    try{ admin.initializeApp(); }catch(err){ console.error('Firebase init failed',err); process.exit(1); }
  }
  const db = admin.firestore();
  console.log('Loading leads...');
  const crmSnap = await db.collection('crm_data').doc('shared').get();
  const leads = crmSnap.exists ? (crmSnap.data().leads || []) : [];
  console.log('Leads:', leads.length);

  const convSnap = await db.collection('conversations').get();
  const convs = convSnap.docs.map(d=>({ id: d.id, data: d.data()||{} }));

  let mergedCount = 0;

  for(const lead of leads){
    const leadDigits = onlyDigits(lead.telefone || '');
    const leadNorm = leadDigits.startsWith('55') ? leadDigits.slice(2) : leadDigits;
    if(leadNorm.length < 8) continue;
    const leadLast10 = leadNorm.slice(-10);
    const leadLast8 = leadNorm.slice(-8);
    const targetId = leadLast10;

    // ensure target exists
    const targetRef = db.collection('conversations').doc(targetId);
    const targetSnap = await targetRef.get();
    if(!targetSnap.exists){
      await targetRef.set({ telefone: leadLast11, leadId: lead.id, leadNome: lead.nome }, { merge: true });
    }

    for(const conv of convs){
      const idLast10 = onlyDigits(conv.id).slice(-10);
      if(!idLast10) continue;
      if(idLast10 === leadLast10) continue;
      const convTelField = onlyDigits(conv.data.telefone || '').slice(-10);
      // match by last8
      if((idLast10 && idLast10.slice(-8) === leadLast8) || (convTelField && convTelField.slice(-8) === leadLast8)){
        console.log(`Merging ${conv.id} -> ${targetId} for lead ${lead.nome} (${lead.id})`);
        const srcRef = db.collection('conversations').doc(conv.id);
        const msgs = await srcRef.collection('messages').get();
        let copied = 0;
        for(const m of msgs.docs){
          const tgtMsgRef = targetRef.collection('messages').doc(m.id);
          const exists = await tgtMsgRef.get();
          if(!exists.exists){ await tgtMsgRef.set(m.data()); copied++; }
        }
        // update metadata
        await targetRef.set({ leadId: lead.id, leadNome: lead.nome, telefone: leadLast11 }, { merge: true });
        await srcRef.delete();
        mergedCount++;
        console.log(`  Copied ${copied} messages, deleted ${conv.id}`);
      }
    }
  }

  console.log('Done. Merged groups:', mergedCount);
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
