import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT || path.resolve('C:/Users/leall/Downloads/rede-leads-firebase-adminsdk-fbsvc-dc9fb0de05.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account not found at', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const leadIds = ['1781041260', '1352553534'];
const phonesToCheck = ['1781041260', '1352553534', '551781041260', '551352553534'];

function pretty(o) { return JSON.stringify(o, null, 2); }

async function inspect() {
  console.log('Checking lead docs by id...');
  for (const id of leadIds) {
    const snap = await db.collection('leads').doc(id).get();
    console.log(`\nlead doc: ${id}  exists=${snap.exists}`);
    if (snap.exists) console.log(pretty(snap.data()));
  }

  console.log('\nSearching leads by phone fields...');
  for (const p of phonesToCheck) {
    const q1 = await db.collection('leads').where('telefone', '==', p).get();
    const q2 = await db.collection('leads').where('telefone_norm', '==', p).get().catch(()=>({size:0,docs:[]}));
    const q3 = await db.collection('leads').where('telefone_real', '==', p).get().catch(()=>({size:0,docs:[]}));
    console.log(`\nphone: ${p}  matches telefone=${q1.size} telefone_norm=${q2.size} telefone_real=${q3.size}`);
    q1.docs.forEach(d=> console.log(' leads.tel ->', d.id, JSON.stringify(d.data())));
    q2.docs.forEach(d=> console.log(' leads.tel_norm ->', d.id, JSON.stringify(d.data())));
    q3.docs.forEach(d=> console.log(' leads.tel_real ->', d.id, JSON.stringify(d.data())));
  }

  console.log('\nInspecting conversations...');
  const convIds = [...phonesToCheck, ...leadIds];
  const seen = new Set();
  for (const id of convIds) {
    if (seen.has(id)) continue; seen.add(id);
    const snap = await db.collection('conversations').doc(id).get();
    const countSnap = await db.collection('conversations').doc(id).collection('messages').get();
    console.log(`\nconversation: ${id} exists=${snap.exists} messages=${countSnap.size}`);
    if (snap.exists) console.log(pretty(snap.data()));
  }
}

inspect().then(()=>console.log('\nDone')).catch(e=>{console.error('Error', e); process.exit(1);});
