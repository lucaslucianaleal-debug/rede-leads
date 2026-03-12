import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = path.resolve('./serviceAccountKey.json');
let serviceAccount = null;
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  try {
    const json = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
    serviceAccount = JSON.parse(json);
  } catch (e) {
    console.error('Erro ao ler/parsear serviceAccountKey.json:', e.message);
  }
}

if (!admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
}
const db = admin.firestore();

async function testFirestore() {
  try {
    const snapshot = await db.collection('conversations').limit(1).get();
    if (snapshot.empty) {
      console.log('Firestore conectado, mas coleção conversations está vazia.');
    } else {
      snapshot.forEach(doc => {
        console.log('Firestore conectado! Documento exemplo:', doc.id, doc.data());
      });
    }
  } catch (e) {
    console.error('Erro ao conectar Firestore:', e);
  }
}

testFirestore();
