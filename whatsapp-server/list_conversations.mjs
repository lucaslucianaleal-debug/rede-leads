import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

try{
  const svc = JSON.parse(fs.readFileSync(path.join(__dirname,'serviceAccountKey.json'),'utf8'));
  if(!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(svc), projectId: svc.project_id });
}catch(e){
  try{ if(!admin.apps.length) admin.initializeApp(); }catch(err){ console.error('Firebase init failed', err); process.exit(1); }
}

const db = admin.firestore();

try{
  const snap = await db.collection('conversations').get();
  const ids = snap.docs.map(d=>d.id);
  if(ids.length === 0){ console.log('No conversations found'); process.exit(0); }
  // shuffle
  for(let i = ids.length -1; i>0; i--){ const j = Math.floor(Math.random()*(i+1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const sample = ids.slice(0, Math.min(5, ids.length));
  console.log(`Total conversations: ${ids.length}\n`);
  sample.forEach(id => {
    const digits = onlyDigits(id);
    const info = {
      id,
      digits,
      digitsLength: digits.length,
      startsWith55: digits.startsWith('55'),
      canonical10: (digits.length>=10) ? digits.slice(-10) : null
    };
    console.log(JSON.stringify(info));
  });
  process.exit(0);
}catch(e){ console.error('Error fetching conversations:', e); process.exit(1); }
