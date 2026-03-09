import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }
async function main(){
  try{ const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8')); admin.initializeApp({ credential: admin.credential.cert(svc) }); }catch(e){ try{ admin.initializeApp(); }catch(err){ console.error('Firebase init failed',err); process.exit(1); } }
  const db = admin.firestore();
  const convs = await db.collection('conversations').get();
  console.log('Total convs',convs.size);
  convs.forEach(doc=>{
    const d = doc.data()||{};
    console.log(doc.id,'telefone=',d.telefone,'leadId=',d.leadId,'leadNome=',d.leadNome);
  });
  await admin.app().delete(); process.exit(0);
}
main().catch(e=>{ console.error(e); process.exit(1); });
