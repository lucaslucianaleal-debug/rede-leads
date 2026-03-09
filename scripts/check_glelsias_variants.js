import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }
async function main(){
  try{ const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8')); admin.initializeApp({ credential: admin.credential.cert(svc) }); }catch(e){ try{ admin.initializeApp(); }catch(err){ console.error('Firebase init failed',err); process.exit(1); } }
  const db = admin.firestore();
  const fragments = ['35991141019','5535991141019','991141019','991141019','991141019','591141019','35991141019','53591141019'];
  const convs = await db.collection('conversations').get();
  const found = [];
  convs.forEach(doc=>{
    const id = doc.id; const data = doc.data()||{};
    const idDigits = onlyDigits(id);
    for(const f of fragments){ if(idDigits.includes(onlyDigits(f)) || onlyDigits(data.telefone||'').includes(onlyDigits(f))){ found.push({id,telefone:data.telefone,leadId:data.leadId,leadNome:data.leadNome}); break; } }
  });
  console.log('Found matches:', found.length);
  for(const f of found) console.log(f);
  await admin.app().delete(); process.exit(0);
}
main().catch(e=>{ console.error(e); process.exit(1); });
