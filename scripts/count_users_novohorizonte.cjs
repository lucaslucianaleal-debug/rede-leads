const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TARGET = 'odontocompany-novohorizonte';

async function run() {
  try {
    const ids = new Set();

    // users collection
    const q1 = await db.collection('users').where('clinicId', '==', TARGET).get();
    q1.forEach(d => ids.add(`users:${d.id}`));
    const q2 = await db.collection('users').where('clinics', 'array-contains', TARGET).get();
    q2.forEach(d => ids.add(`users:${d.id}`));

    const crmIds = new Set();
    const q3 = await db.collection('crm_users').where('clinicId', '==', TARGET).get();
    q3.forEach(d => crmIds.add(`crm_users:${d.id}`));
    const q4 = await db.collection('crm_users').where('clinics', 'array-contains', TARGET).get();
    q4.forEach(d => crmIds.add(`crm_users:${d.id}`));

    console.log('TARGET:', TARGET);
    console.log('users docs with clinicId or clinics array ->', q1.size + q2.size, '(unique by id:', new Set([...q1.docs.map(d=>d.id), ...q2.docs.map(d=>d.id)]).size, ')');
    console.log('crm_users docs with clinicId or clinics array ->', q3.size + q4.size, '(unique by id:', new Set([...q3.docs.map(d=>d.id), ...q4.docs.map(d=>d.id)]).size, ')');

    // Unique overall
    const allIds = new Set();
    q1.forEach(d=>allIds.add(d.id)); q2.forEach(d=>allIds.add(d.id)); q3.forEach(d=>allIds.add(d.id)); q4.forEach(d=>allIds.add(d.id));
    console.log('Unique user UIDs across both collections ->', allIds.size);

    console.log('\nSample IDs (up to 20):');
    let i=0;
    for (const id of Array.from(allIds)) {
      if (i++>=20) break;
      console.log('-', id);
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
