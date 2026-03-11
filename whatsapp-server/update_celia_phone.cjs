const fs = require('fs');
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const crmRef = db.collection('crm_data').doc('shared');
  const snap = await crmRef.get();
  if (!snap.exists) {
    console.error('crm_data.shared not found');
    process.exit(1);
  }
  const data = snap.data() || {};
  const leads = data.leads || [];
  let updated = false;
  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    if (!l) continue;
    const nome = String(l.nome || '').toLowerCase();
    if (nome.includes('celi') || nome.includes('celia')) {
      console.log('Found candidate lead:', l.nome, l.telefone);
      leads[i].telefone = '5517997791492';
      updated = true;
    }
  }
  if (updated) {
    await crmRef.set({ leads }, { merge: true });
    console.log('Celia phone updated to 5517997791492');
  } else {
    console.log('No Celia lead found to update');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
