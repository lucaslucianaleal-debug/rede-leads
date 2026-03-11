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

const canonicalId = '1792702010';
const desiredFull = '17992702010';
(async ()=>{
  try{
    const sharedSnap = await db.collection('crm_data').doc('shared').get();
    const leads = sharedSnap.exists ? (sharedSnap.data().leads || []) : [];
    const desiredDigits = onlyDigits(desiredFull);
    let matchedLead = null;
    for (const l of leads) {
      const ld = onlyDigits(l.telefone || '');
      if (!ld) continue;
      if (ld === desiredDigits) { matchedLead = l; break; }
      const canon = ld.length>=10? ld.slice(-10): ld;
      if (canon === canonicalId) { matchedLead = l; break; }
    }
    console.log('Matched lead:', matchedLead ? { id: matchedLead.id, nome: matchedLead.nome, telefone: matchedLead.telefone } : null);

    const convRef = db.collection('conversations').doc(canonicalId);
    const updates = { telefone: canonicalId };
    if (matchedLead) { updates.leadNome = matchedLead.nome || ''; updates.leadId = matchedLead.id; }
    await convRef.set(updates, { merge: true });
    console.log('Conversation updated with lead info:', canonicalId);
    process.exit(0);
  }catch(err){ console.error('Error:', err); process.exit(1); }
})();