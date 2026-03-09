import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }
function lastN(s,n){ const d=onlyDigits(s); return d.length>=n?d.slice(-n):d; }

async function main(){
  try{
    const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }catch(e){
    try{ admin.initializeApp(); }catch(err){ console.error('Firebase init failed',err); process.exit(1); }
  }
  const db = admin.firestore();
  const target = '81127522535';
  const variants = new Set();
  const convs = await db.collection('conversations').get();
  convs.forEach(doc=>{
    const id = doc.id;
    const data = doc.data()||{};
    const tele = data.telefone || '';
    const idDigits = onlyDigits(id);
    if(idDigits.endsWith(target) || onlyDigits(tele).endsWith(target) || idDigits.includes(target) || onlyDigits(tele).includes(target)){
      variants.add(id);
    }
  });
  console.log('Found variants for',target,':');
  for(const v of variants) console.log(' -',v);
  await admin.app().delete();
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
