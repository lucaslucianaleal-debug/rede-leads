import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

async function main(){
  const args = process.argv.slice(2);
  if(args.length < 2){
    console.error('Usage: node merge_fragment_into_lead.js <sourceFragment> <targetLeadFragment>');
    process.exit(1);
  }
  const sourceFrag = onlyDigits(args[0]);
  const targetFrag = onlyDigits(args[1]);

  try{
    const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }catch(e){
    try{ admin.initializeApp(); }catch(err){ console.error('firebase init failed',err); process.exit(1); }
  }
  const db = admin.firestore();

  // find target lead
  const crmRef = db.collection('crm_data').doc('shared');
  const crmSnap = await crmRef.get();
  if(!crmSnap.exists){ console.error('crm_data/shared missing'); process.exit(1); }
  const leads = crmSnap.data().leads || [];
  const targetLead = leads.find(l => onlyDigits(l.telefone||'').includes(targetFrag) || onlyDigits(l.telefone||'').endsWith(targetFrag.slice(-8)));
  if(!targetLead){ console.error('Target lead not found for fragment', targetFrag); process.exit(1); }
  console.log('Target lead:', targetLead.id, targetLead.nome, targetLead.telefone);

  const targetLast11 = onlyDigits(targetLead.telefone||'').slice(-11);
  const targetRef = db.collection('conversations').doc(targetLast11);
  const targetSnap = await targetRef.get();
  if(!targetSnap.exists){
    console.log('Creating target conversation', targetLast11);
    await targetRef.set({ telefone: targetLast11, leadId: targetLead.id, leadNome: targetLead.nome }, { merge: true });
  } else {
    await targetRef.set({ leadId: targetLead.id, leadNome: targetLead.nome }, { merge: true });
  }

  // find source conversations matching sourceFrag in id or telefone
  const convsSnap = await db.collection('conversations').get();
  const matches = [];
  for(const doc of convsSnap.docs){
    const id = doc.id;
    const data = doc.data()||{};
    const idDigits = onlyDigits(id);
    const telField = onlyDigits(data.telefone||'');
    if(idDigits.includes(sourceFrag) || telField.includes(sourceFrag) || idDigits.slice(-8) === sourceFrag.slice(-8) || telField.slice(-8) === sourceFrag.slice(-8)){
      // skip if already the target
      if(id.replace(/\D/g,'').slice(-11) === targetLast11) continue;
      matches.push({ id: doc.id, data });
    }
  }

  console.log('Found source conversations to merge:', matches.length);
  let totalCopied = 0;
  for(const m of matches){
    console.log('Merging', m.id, '->', targetLast11);
    const srcRef = db.collection('conversations').doc(m.id);
    const msgs = await srcRef.collection('messages').get();
    let copied = 0;
    for(const md of msgs.docs){
      const tgtMsgRef = targetRef.collection('messages').doc(md.id);
      const exists = await tgtMsgRef.get();
      if(!exists.exists){ await tgtMsgRef.set(md.data()); copied++; }
    }
    // delete source doc
    await srcRef.delete();
    console.log(`Copied ${copied} messages from ${m.id} and deleted it`);
    totalCopied += copied;
  }

  // ensure target metadata
  await targetRef.set({ leadId: targetLead.id, leadNome: targetLead.nome, telefone: targetLast11 }, { merge: true });

  console.log('Done. Total messages copied:', totalCopied);
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
