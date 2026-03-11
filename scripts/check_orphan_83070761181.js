import admin from 'firebase-admin';
import { readFileSync } from 'fs';

try {
  const svc = JSON.parse(readFileSync('whatsapp-server/serviceAccountKey.json','utf8'));
  admin.initializeApp({ credential: admin.credential.cert(svc), projectId: svc.project_id });
} catch (e) {
  console.error('failed to init admin', e.message || e);
  process.exit(1);
}
const db = admin.firestore();
(async ()=>{
  const last10 = '83070761181'.replace(/\D/g,'').slice(-10);
  console.log('Searching for any conversation doc whose id or telefone last10 ==', last10);
  const snaps = await db.collection('conversations').get();
  const matches = [];
  for (const d of snaps.docs) {
    const idLast = String(d.id).replace(/\D/g,'').slice(-10);
    const telLast = String(d.data()?.telefone || '').replace(/\D/g,'').slice(-10);
    if (idLast === last10 || telLast === last10) matches.push({ id: d.id, data: d.data() });
  }
  if (matches.length === 0) {
    console.log('No matching conversation documents found.');
  } else {
    console.log('Found', matches.length, 'matches:');
    for (const m of matches) console.log(m.id, JSON.stringify({ telefone: m.data.telefone, leadId: m.data.leadId, leadNome: m.data.leadNome }));
  }
  process.exit(0);
})();
