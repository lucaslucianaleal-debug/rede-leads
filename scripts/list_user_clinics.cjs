const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function run() {
  try {
    const usersSnap = await db.collection('users').get();
    const crmSnap = await db.collection('crm_users').get();
    const set = new Set();
    usersSnap.forEach(d => { const data = d.data(); if (data && data.clinicId) set.add(data.clinicId); if (data && data.clinics) data.clinics.forEach(c=>set.add(c)); });
    crmSnap.forEach(d => { const data = d.data(); if (data && data.clinicId) set.add(data.clinicId); if (data && data.clinics) data.clinics.forEach(c=>set.add(c)); });
    console.log('Unique clinicIds found in users/crm_users:');
    console.log([...set].sort().join('\n'));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
