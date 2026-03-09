import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }
async function main(){
  try{ const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8')); admin.initializeApp({ credential: admin.credential.cert(svc) }); }catch(e){ try{ admin.initializeApp(); }catch(err){ console.error('Firebase init failed',err); process.exit(1); } }
  const db = admin.firestore();
  const frags = ['81127522535','1127522535','127522535','27522535','12752','8127522535','55'+'81127522535'];
  const convs = await db.collection('conversations').get();
  const found = [];
  convs.forEach(doc=>{
    const id = doc.id;
    const tid = onlyDigits(id);
    for(const f of frags){ if(tid.includes(onlyDigits(f))){ found.push({id,telefone: (doc.data()||{}).telefone}); break; } }
  });
  console.log('Fragments searched:',frags);
  console.log('Matches:',found.length);
  for(const f of found) console.log(' -',f.id,'telefone=',f.telefone);
  await admin.app().delete(); process.exit(0);
}
main().catch(e=>{ console.error(e); process.exit(1); });
