import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = path.resolve('./serviceAccountKey.json');
let serviceAccount = null;
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  try {
    serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  } catch (e) {
    console.error('Erro ao ler service account:', e.message);
    process.exit(1);
  }
}

if (!admin.apps.length) {
  if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  else admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();

const pairs = [
  { oldId: '7192862059', newId: '557192862059' },
  { oldId: '9885917880', newId: '559885917880' },
  { oldId: '3499097128', newId: '553499097128' }
];

async function check() {
  for (const p of pairs) {
    try {
      const oldRef = db.collection('conversations').doc(p.oldId);
      const newRef = db.collection('conversations').doc(p.newId);
      const [oldSnap, newSnap] = await Promise.all([oldRef.get(), newRef.get()]);

      const oldExists = oldSnap.exists;
      const newExists = newSnap.exists;

      let newMessages = 0;
      if (newExists) {
        const msgs = await newRef.collection('messages').get();
        newMessages = msgs.size;
      }

      console.log(`Check ${p.oldId} -> ${p.newId}: oldExists=${oldExists}, newExists=${newExists}, newMessages=${newMessages}`);
    } catch (e) {
      console.error('Erro ao verificar pair', p, e);
    }
  }
}

check().then(() => process.exit(0)).catch(() => process.exit(1));
