const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate(clinicId) {
  const srcRef = db.collection('crm_data').doc('shared');
  const dstRef = db.collection('clinics').doc(clinicId).collection('meta').doc('shared');

  // fallback path used by useLeads: clinics/{clinicId}/shared (we'll write there too)
  const dstRefAlt = db.collection('clinics').doc(clinicId).collection('sharedDocs').doc('shared');

  try {
    const src = await srcRef.get();
    if (!src.exists) {
      console.log('No source shared doc found at crm_data/shared');
      return;
    }
    const data = src.data();
    // write to clinics/{clinicId}/shared (doc)
    const clinicShared = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
    await clinicShared.set(data, { merge: true });
    console.log(`Migrated crm_data/shared -> clinics/${clinicId}/shared/shared`);
  } catch (e) {
    console.error('Migration error:', e);
    process.exit(1);
  }
}

const clinic = process.argv[2] || 'odontocompany-olimpia';
console.log('Migrating to clinic:', clinic);
migrate(clinic).then(() => console.log('Done')).catch((e) => console.error(e));
